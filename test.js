const GSM = require("nodegsm");

async function testGSMModem() {
  const gsm = new GSM("COM17"); // Specify COM17 as the port

  try {
    await gsm.connect();
    console.log("Connected to the GSM modem on COM17");

    const manufacturer = await gsm.getManufacturerInformation();
    console.log(manufacturer); // Should log the manufacturer information

    const unreadMessages = await gsm.readSMS(
      GSM.MessageStorage.sim,
      GSM.MessageFilter.unread
    );
    console.log(unreadMessages); // Logs list of unread SMS messages

    await gsm.sendSMS("+31111222333", "Hello from NodeJS");
    console.log("SMS sent successfully");
  } catch (error) {
    console.error("Error communicating with the GSM modem:", error);
  }
}

// Call the async function to perform the operations
testGSMModem();
