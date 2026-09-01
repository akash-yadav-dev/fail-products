export function zeptoMailConfig() {
  return {
    token: process.env.ZEPTOMAIL_TOKEN ?? "",
    fromAddress: process.env.ZEPTOMAIL_FROM_ADDRESS ?? "",
  };
}
