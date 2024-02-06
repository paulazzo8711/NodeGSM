
//   port,
//   {
//     baudRate: baudRate,
//     dataBits: 8,
//     stopBits: 1,
//     parity: "none",
//     rtscts: false,
//     xon: false,
//     xoff: false,
//     xany: false,
//     autoDeleteOnReceive: true,
//     enableConcatenation: true,
//     incomingCallIndication: true,
//     incomingSMSIndication: true,
//     pin: "", // SIM card PIN, if any
//     customInitCommand: "", // Custom AT command to initialize the modem
//     logger: console,
//   },
//   (err) => {
//     if (err) {
//       console.error("Failed to open the port:", err);
//       return;
//     }

//     console.log(`Port ${port} opened successfully`);

//     // Example command to test the connection
//     modem.execute("AT", (result) => {
//       console.log("AT command response:", result);
//     });
//   }
// );