const { PhoneNumberType } = require("./constants");
module.exports = class Parser {
  // Example input:
  // +CSQ: 20,99
  parseSignalQuality(input) {
    const signal = input.replace("+CSQ: ", "").split(",");
    const signalStrength = parseInt(signal[0]);
    const bitErrorRate = parseInt(signal[1]);
    let dbm = 0;
    let description = "";
    if (signalStrength == 99) {
      dbm = null;
      description = "No Signal";
    } else {
      dbm = -113 + signalStrength * 2;
      description = this.dbmDescription(dbm);
    }

    return {
      description,
      dbm,
      bitErrorRate: this.berDescription(bitErrorRate),
    };
  }

  dbmDescription(dbm) {
    if (dbm >= -70) {
      return "Excellent";
    }
    if (dbm >= -85) {
      return "Good";
    }
    if (dbm >= -100) {
      return "Fair";
    }
    if (dbm > -110) {
      return "Poor";
    }
    return "No Signal";
  }

  berDescription(ber) {
    const map = {
      0: "less than 0.2%",
      1: "0.2% to 0.4%",
      2: "0.4% to 0.8%",
      3: "0.8% to 1.6%",
      4: "1.6% to 3.2%",
      5: "3.2% to 6.4%",
      6: "6.4% to 12.8%",
      7: "more than 12.8%",
      99: "N/A",
    };
    return map[ber] || "N/A";
  }

  // Example input:
  // +CMGL: 0,"REC UNREAD","002B003100310031003200320032003300330033003400340034",,"19/07/07,20:40:54+08",145,15
  // 00480065006C006C006F00200057006F0072006C006400210020D83CDF0D
  parseTextMessageResult(result) {
    const list = result.split("\r\n");
    let messages = [];
    for (let i = 0; i < list.length; i += 2) {
      try {
        const parts = list[i].replace("+CMGL: ", "").split(",");

        const index = parseInt(parts[0]);
        const status = parts[1].trimQuotes();
        const sender = parts[2].trimQuotes().decodedUCS2Hex();
        const date = parts[4].trimQuotes().replace(/\//g, "-");
        const time = parts[5].trimQuotes();
        const numberType = parseInt(parts[6]);
        const textLength = parseInt(parts[7]);
        const messageText = list[i + 1];

        // Message Text decode. Can be either UTF-8 or UCS2. We check this by the char byte size
    // Since the character set is set to UCS2, decode message text as UCS2 hex directly
const decodedText = messageText.decodedUCS2Hex();


        //Time calculate
        const timeParts = time.split("+");
        const timezone = (parseFloat(timeParts[1]) / 4.0) * 100;
        const timezonePrefix = timezone > 0 ? "+" : "-";
        const timezoneString =
          timezonePrefix + Math.abs(timezone).toString().padStart(4, "0");
        const timeStamp = `20${date}T${timeParts[0]}${timezoneString}`;
        const senderString = [
          PhoneNumberType.text,
          PhoneNumberType.text2,
        ].includes(numberType)
          ? sender.decodedFromAsciiString()
          : sender;
        messages.push({
          index: index,
          status: status,
          sender: senderString,
          time: new Date(timeStamp),
          text: decodedText,
          numberType: numberType,
          rawHeader: list[i],
          rawMessage: messageText,
        });
      } catch(error) {
        return result, error;
      }
    }
    return messages;
  }

  // Example input:
  // +CPBR: 1,"+31654501233",145,"0056006F006900630065006D00610069006C002000620065006C006C0065006E"
  // +CPBR: 2,"1800",129,"00310038003000300020006E0075006D006D006500720069006E0066006F"
  // +CPBR: 3,"+31654500100",145,"004B006C0061006E00740065006E0073006500720076006900630065"
  parseContacts(input) {
    return input.split("\r\n").map((record) => {
      const parts = record.replace("+CPBR: ", "").split(",");
      return {
        index: parseInt(parts[0]),
        numberType: parts[2],
        number: parts[1].trimQuotes(),
        text: parts[3].trimQuotes().decodedUCS2Hex(),
      };
    });
  }
};

// String extensions
Object.assign(String.prototype, {
  /**
   * @returns {String}
   */
  trimQuotes() {
    // Check if the input string is undefined
    try {
      return this.replace(/^"?(.*?)"?$/, "$1");
    } catch (error) {
      return "";
    }

    // Otherwise, perform the trimQuotes operation
    
  },

  /**
   * @returns {String}
   */
  decodedUCS2Hex() {
    return Buffer.from(this, "hex").swap16().toString("ucs2");
  },

  /**
   * @returns {String}
   */
  UCS2HexString(text) {
    // Convert the text to a UCS-2 encoded buffer and then to a hex string.
    let hexStr = Buffer.from(text, "ucs2").toString("hex").toUpperCase();
    // Apply manual byte swapping to the hex string.
    return manualSwap16(hexStr);
  },
  /**
   * Swaps bytes of a UCS-2 hex string.
   * @param {String} hexStr The hex string to swap.
   * @returns {String} The swapped hex string.
   */
  manualSwap16(hexStr) {
    let swapped = "";
    for (let i = 0; i < hexStr.length; i += 4) {
      // Swap every two bytes (4 hex characters)
      swapped += hexStr.substring(i + 2, i + 4) + hexStr.substring(i, i + 2);
    }
    return swapped.toUpperCase();
  },

  /**
   * @returns {String}
   */
  decodedFromAsciiString() {
    let output = "";
    let i = 0;
    while (i < this.length) {
      if (this[i] < 2 && i + 2 < this.length) {
        output += String.fromCharCode(
          parseInt(this[i] + this[i + 1] + this[i + 2])
        );
        i += 3;
      } else if (i + 1 < this.length) {
        output += String.fromCharCode(parseInt(this[i] + this[i + 1]));
        i += 2;
      } else {
        i += 1;
      }
    }
    return output;
  },
});
