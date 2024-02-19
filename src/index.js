const SerialPort = require("serialport");
const GSMErrors = require("./errors");
const Parser = require("./parsing");
const Constants = require("./constants");
const smsPdu = require("node-sms-pdu");
const GSM_PROMPT = ">";
const TIMEOUT_DEFAULT = 30000;
const TIMEOUT_LONG = 20000;
const CTRL_Z = "\x1A";

class GSM {
  /**
   *
   * @param {String} path - A path to the GSM Modem device (ex: '/dev/gsmmodem')
   */
  constructor(path) {
    this.path = path;
    this.connected = false;
    this.serialPort = new SerialPort(path, {
      baudRate: 115200,
      autoOpen: false,
    });
    this.parser = new Parser();
  }

  /**
   * Connects to GSM modem serial port.
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.serialPort.open((error) => {
        if (error) {
          return reject(`Error connecting to serial port: '${error}'`);
        }
        this.connected = true;
        resolve();
      });

      this.serialPort.on("close", () => {
        this.connected = false;
        console.debug("Serial port closed");
      });

      this.serialPort.on("error", (error) => {
        this.connected = false;
        console.debug(`Serial port error: ${error}`);
      });
    });
  }

  /**
   * Disconnects from GSM modem serial port.
   */
  disconnect() {
    this.serialPort.close();
    this.connected = false;
  }

  /**
   * returns no errors if the modem is operational
   */
  async check() {
    return await this.runCommand("AT");
  }

  /**
   * Returns the manufacturer identification.
   */
  async getManufacturerInformation() {
    return await this.runCommand("AT+CGMI");
  }

  /**
   * Returns the model identification.
   */
  async getModelIdentification() {
    let result = await this.runCommand("AT+CGMM");
    return result.replace("+CGMM:", "");
  }

  /**
   * Returns the software revision identification.
   */
  async getRevisionIdentification() {
    let result = await this.runCommand("AT+CGMR");
    return result.replace("+CGMR:", "");
  }

  /**
   * Returns the equipment supported command set list.
   * Where:
   *    +CGSM: GSM ETSI command set
   *    +FCLASS: Fax command set
   *    +DS: Data Service common modem command set
   *    +MS: Mobile Specific command set
   */
  async getCapabilitiesList() {
    let result = await this.runCommand("AT+GCAP");
    return result.replace("+GCAP: ", "").split(",");
  }

  /**
   * Returns the device board serial number.
   */
  async getSerialNumber() {
    return await this.runCommand("AT+CGSN", TIMEOUT_LONG);
  }

  /**
   * Returns the value of the Internal Mobile Subscriber Identity stored in the SIM without command echo.
   */
  async getSubscriberId() {
    const result = await this.runCommand("AT+CIMI", TIMEOUT_LONG);
    return result.replace("+CIMI:", "");
  }

  /**
   * Execution command returns the subscriber number i.e. the phone number of the device that is stored in the SIM card.
   */
  async getSubscriberNumber() {
    const result = await this.runCommand("AT+CNUM");
    return result.replace("+CNUM:", "");
  }

  /**
   * Returns information about the device
   */
  async getIdentificationInformation() {
    return await this.runCommand("ATI");
  }

  /**
   * Returns the wireless module connection mode (data, fax, voice),
   */
  async getActiveServiceClass() {
    return await this.runCommand("AT+FCLASS?");
  }

  /**
   * Sets the wireless module in specified connection mode (data, fax, voice),
   * hence all the calls done afterwards will be data or voice.
   * @param {GSM.ServiceClass} serviceClass
   */
  async setActiveServiceClass(serviceClass) {
    return await this.runCommand(`AT+FCLASS=${serviceClass}`);
  }

  /**
   * Starts a call to the phone number given as parameter.
   * @param {String} number - Phone number to be dialed
   * Note: the numbers accepted are 0-9 and *,#,”A”, ”B”, ”C”, ”D”,”+”.
   * Note: type of call (data, fax or voice) depends on last Active Service Class (+FCLASS) setting.
   */
  async dial(number) {
    return await this.runCommand(`ATD${number}`);
  }

  /**
   * Starts a voice call to the phone number given as parameter.
   * @param {String} number - Phone number to be dialed
   * Note: the numbers accepted are 0-9 and *,#,”A”, ”B”, ”C”, ”D”,”+”.
   */
  async dialVoice(number) {
    return await this.runCommand(`ATD${number};`);
  }

  /**
   * Answer an incoming call if automatic answer is disabled.
   */
  async answer() {
    return await this.runCommand("ATA");
  }

  /**
   * Get the number of rings required before device automatically answers an incoming call.
   *  0 means auto answer is disabled
   */
  async getAutoAnswerRings() {
    return parseInt(await this.runCommand("ATS0?"));
  }

  /**
   * Sets the number of rings required before device automatically answers an incoming call
   * @param {Number} numberOfRings - number of rings before answer (between 0 to 255). Set to 0 to disable auto answer.
   */
  async setAutoAnswerRings(numberOfRings) {
    return parseInt(await this.runCommand(`ATS0=${numberOfRings}`));
  }

  /**
   * Execution command is used to close the current conversation (voice, data or fax).
   * Note: this command can be issued only in command mode;
   */
  async hangup() {
    return await this.runCommand("AT+CHUP");
  }

  /**
   * Gets the current character set used by the device.
   */
  async getCharacterSet() {
    let result = await this.runCommand("AT+CSCS?");
    return result.replace("CSCS: ", "").trimQuotes();
  }

  /**
   * Sets the current character set used by the device.
   * @param {GSM.CharacterSet} characterSet
   */
  async setCharacterSet(characterSet) {
    return await this.runCommand(`AT+CSCS="${characterSet}"`);
  }

  /**
   *  Reports received signal quality
   */
  async getSignalQuality() {
    const result = await this.runCommand("AT+CSQ");
    return this.parser.parseSignalQuality(result);
  }

  /**
   * Returns the current GSM network operator selection
   */
  async getCurrentOperator() {
    const result = await this.runCommand("AT+COPS?");
    const parts = result.replace("+COPS: ", "").split(",");
    if (parts[2]) {
      return parts[2].trimQuotes();
    }
    return "Unknown";
  }

  /**
   * Selects phonebook memory storage
   * @param {GSM.PhoneBookStorage} storage - Phone book storage type
   */
  async setPhoneBookStorage(storage) {
    await this.runCommand(`AT+CPBS="${storage}"`);
  }

  /**
   * Returns for a given phone book storage the maximum number of contacts and the used contact slots
   * @param {GSM.PhoneBookStorage} phoneBook - Phone book storage type
   */
  async getPhoneBookUsage(phoneBook) {
    await this.setPhoneBookStorage(phoneBook);
    const result = await this.runCommand(`AT+CPBS?`);
    const splitted = result.split(",");
    return {
      used: parseInt(splitted[1]),
      capacity: parseInt(splitted[2]),
    };
  }

  /**
   * Returns a range of contacts for a given phone book
   * @param {GSM.PhoneBookStorage} phoneBook - Phone book storage type
   * @param {Number} startIndex - Lower edge of the contact index to fetch
   * @param {Number} endIndex  - Upper edge of the contact index to fetch
   */
  async readPhoneBook(phoneBook, startIndex, endIndex) {
    await this.setPhoneBookStorage(phoneBook);
    await this.setCharacterSet(GSM.CharacterSet.UCS2);
    const result = await this.runCommand(
      `AT+CPBR=${startIndex},${endIndex}`,
      TIMEOUT_LONG
    );
    return this.parser.parseContacts(result);
  }

  /**
   * Adds a new contact to the end of a given phone book
   * @param {GSM.PhoneBookStorage} phoneBook - Phone book storage type
   * @param {String} number - The phone number of the contact
   * @param {GSM.PhoneNumberType} numberType - Phone number type
   * @param {String} text - Contact name
   */
  async addContact(phoneBook, number, numberType, text) {
    await this.setPhoneBookStorage(phoneBook);
    await this.setCharacterSet(GSM.CharacterSet.UCS2);
    await this.runCommand(
      `AT+CPBW=,"${number}",${numberType},"${text.UCS2HexString()}"`,
      TIMEOUT_LONG
    );
  }

  /**
   * Removes a contact from a given phone book at a given index
   * @param {GSM.PhoneBookStorage} phoneBook - Phone book storage type
   * @param {Index} index - The index of the contact to delete
   */
  async deleteContact(phoneBook, index) {
    await this.setPhoneBookStorage(phoneBook);
    await this.runCommand(`AT+CPBW=${index}`, TIMEOUT_LONG);
  }

  /**
   * Updates or creates a contact from a given phone book at a given index
   * @param {GSM.PhoneBookStorage} phoneBook - Phone book storage type
   * @param {Number} index - The index of the contact to update
   * @param {String} number - The phone number of the contact
   * @param {GSM.PhoneNumberType} numberType - Phone number type
   * @param {String} text - Contact name
   */
  async setContact(phoneBook, index, number, numberType, text) {
    await this.setPhoneBookStorage(phoneBook);
    await this.setCharacterSet(GSM.CharacterSet.UCS2);
    await this.runCommand(
      `AT+CPBW=${index},"${number}",${numberType},"${text.UCS2HexString()}"`,
      TIMEOUT_LONG
    );
  }

  /**
   *
   * @param {GSM.MessageStorage} readStorage - memory from which messages are read and deleted
   */
  async setPreferredMessageStorage(readStorage) {
    return await this.runCommand(
      `AT+CPMS="${readStorage}","${GSM.MessageStorage.sim}","${GSM.MessageStorage.sim}"`
    );
  }

  /**
   * Returns the current format of messages used with send, list, read and write command
   */
  async getMessageFormat() {
    const result = await this.runCommand("AT+CMGF?");
    return parseInt(result.replace("+CMGF: ", ""));
  }

  /**
   * Sets the format of messages used with send, list, read and write commands.
   * @param {GSM.MessageFormat} format - The message format to use
   */
  async setMessageFormat(format) {
    return await this.runCommand(`AT+CMGF=${format}`);
  }

  /**
   * Returns a list of all SMS messages for a given storage and filter
   * @param {GSM.MessageStorage} storage - The message storage to read from
   * @param {GSM.MessageFilter} filter - A filter to select messages by status
   */
  async readSMS(storage, filter) {
    await this.setMessageFormat(GSM.MessageFormat.text);
    await this.setPreferredMessageStorage(storage);
    await this.setCharacterSet(GSM.CharacterSet.UCS2);
    await this.runCommand("AT+CSDH=1");
    
    const result = await this.runCommand(`AT+CMGL="${filter.text}"`);
    if (result.length == 0) {
      return [];
    }
    
    try {
      // Attempt to parse the result with the parser
      return this.parser.parseTextMessageResult(result);
    } catch (error) {
      // If parsing fails, log the error and return the raw result
      console.error("Error parsing text message result:", error);
      return result; // Or return an object indicating an error, depending on your needs
    }
  }

  /**
   * Sends a SMS message to the destination number
   * @param {String} msisdn - Destination number
   * @param {String} message - Text message to
   * @returns {String} - Reference ID if the delivery was successful
   */
  async sendSMS(msisdn, message) {
   message = " " + message;

    // Determine if message uses characters outside the GSM 7-bit default alphabet
    // const useUCS2 = !isGSMCharacterSet(message);

    // Set character set based on message content
    // const characterSet = useUCS2 ? GSM.CharacterSet.UCS2 : GSM.CharacterSet.GSM;
    

    await this.setMessageFormat(GSM.MessageFormat.PDU);
    const newRefNumber = generateRandomReferenceNumber();
    // Generate PDUs for the message. Assume generateSubmit handles segmentation if needed.
    // const encoding = useUCS2 ? "ucs2" : "gsm";
    // return(message)
let pdus ;
    try {
      // First attempt to generate PDU
      pdus = smsPdu.generateSubmit(msisdn, message);
    } catch (error) {
      // If an error occurs, log it or handle it as needed
      console.error("Error generating PDU:", error);
    
      // Modify the message by prefixing a space
      const modifiedMessage = " " + message;
    
      // Retry generating PDU with the modified message
      try {
        pdus = smsPdu.generateSubmit(msisdn, modifiedMessage);
      } catch (retryError) {
        // Handle the case where the retry also fails
        console.error("Retry failed:", retryError);
        // Depending on your application, you might throw the error, return, or handle it differently
        throw retryError; // Or another way of handling the error
      }
    }    const encoding =  pdus[0].encoding;

    if(encoding === "ucs2" && pdus.length > 1){
      console.log("ucs multipart");
    let modifiedMessage = '';
    for (let char of message) {
      if (isGSMCharacterSet(char)) {
        modifiedMessage += char;
      } else {
        modifiedMessage += '_'; // Replace non-GSM character with an underscore
      }
    }
    message = modifiedMessage
   
    
    // Continue with the logic, assuming `pdus` has been successfully generated
    const encoding =  pdus[0].encoding;
    }
    // console.log(pdus);
    const characterSet = encoding === 'ucs2' ? GSM.CharacterSet.UCS2 : GSM.CharacterSet.GSM;
    await this.setCharacterSet(characterSet);
    // return characterSet
    // return pdus
    // Send each PDU segment sequentially
    const results = [];
    
    for (const pdu of pdus) {
      // Send length of the PDU in bytes, not the message length
      let modifiedPduHex = pdu.hex;
      let length = pdu.length;
      if (pdus.length > 1) {
        modifiedPduHex =
          pdu.hex.substring(0, 30) + newRefNumber + pdu.hex.substring(32);
      }
      await this.runCommand(`AT+CMGS=${length}`);
      // Send the PDU and store the result
      const result = await this.runCommand(`${modifiedPduHex}${CTRL_Z}`);
      if (result.startsWith("+CMGS:")) {
        console.log("Segment sent successfully:", result);
      } else {
        console.error("Error sending segment:", result);
      // Consider handling this situation more gracefully
        // reject(result)
        return(result)
        break; 
      }
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait 2 seconds before sending the next part
      results.push(result);
    }

    return results;
  }

  /**
   * Deletes a message from storage
   * @param {GSM.MessageStorage} storage - The message storage to delete from
   * @param {Number} index  - The index of the message to delete
   */
  async deleteMessage(storage, index) {
    await this.setPreferredMessageStorage(storage);
    return await this.runCommand(`AT+CMGD=${index}`);
  }

  /**
   * Deletes multiple messages from storage according to the give filter
   * @param {GSM.MessageStorage} storage - The message storage to delete from
   * @param {GSM.MessageDeleteFilter} filter - The delete filter to use
   */
  async deleteAllMessages(storage, filter) {
    await this.setPreferredMessageStorage(storage);
    return await this.runCommand(`AT+CMGD=0,${filter}`);
  }

  async runCommand(command, timeout) {
    if (!timeout) {
      timeout = TIMEOUT_DEFAULT;
    }
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject("Not Connected");
      }

      let timeoutHandle = setTimeout(() => {
        reject("Timeout");
      }, timeout);

      let output = "";
      const dataHandler = (data) => {
        output += data.toString("utf8").trim();

        if (
          output.endsWith(GSM.ReturnCode.ok) ||
          output.endsWith(GSM.ReturnCode.error) ||
          output.endsWith(GSM_PROMPT)
        ) {
          clearTimeout(timeoutHandle);
          this.serialPort.removeListener("data", dataHandler);
        }

        // OK message - success
        if (output.endsWith(GSM.ReturnCode.ok)) {
          setTimeout(() => {
            resolve(output.slice(0, -GSM.ReturnCode.ok.length).trim());
          }, 20);
          return;
        }

        // ERROR message - failure
        else if (output.endsWith(GSM.ReturnCode.error)) {
          setTimeout(() => {
            reject(output);
          }, 20);
          return;
        }

        // > message - prompt for user data
        else if (output.endsWith(GSM_PROMPT)) {
          setTimeout(() => {
            resolve(output);
          }, 20);
          return;
        } else {
          // partial message, wait for more data
        }
      };
      this.serialPort.on("data", dataHandler);
      this.serialPort.write(`${command}\r\n`);
    });
  }

  toString() {
    return `[${this.connected ? "Connected" : "Not Connected"}] ${this.path} `;
  }
}
function manualSwap16(hexStr) {
  let swapped = "";
  for (let i = 0; i < hexStr.length; i += 4) {
    // Swap every two bytes (4 hex characters)
    swapped += hexStr.substring(i + 2, i + 4) + hexStr.substring(i, i + 2);
  }
  return swapped.toUpperCase();
}

function UCS2HexString(text) {
  let hexStr = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Check if the character is ASCII by its code
    if (charCode >= 0 && charCode <= 127) {
      // Convert ASCII character to a UCS-2 encoded buffer and then to a hex string
      let charHex = Buffer.from(text.charAt(i), "ucs2")
        .toString("hex")
        .toUpperCase();
      hexStr += manualSwap16(charHex); // Apply manual byte swapping if necessary
    } else {
      // Replace non-ASCII characters with underscore
      let underscoreHex = Buffer.from("_", "ucs2")
        .toString("hex")
        .toUpperCase();
      hexStr += manualSwap16(underscoreHex); // Apply manual byte swapping if necessary
    }
  }
  return hexStr;
}

function isGSMCharacterSet(message) {
  const gsm0338CharacterSet =
    /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&()*+,-.\/0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\[~\]|€]*$/;
  return gsm0338CharacterSet.test(message);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function generateRandomReferenceNumber() {
  const randomNum = Math.floor(Math.random() * 256); // Generate a random number between 0 and 255
  return randomNum.toString(16).padStart(2, "0").toUpperCase(); // Convert to hexadecimal, ensure 2 characters, uppercase
}
Object.assign(GSM, GSMErrors);
Object.assign(GSM, Constants);
module.exports = GSM;
