// Sends the welcome mail through the transport it is given.
export async function sendWelcome(transport, to) {
  const from = process.env.MAIL_FROM ?? 'noreply@example.com';
  await transport.send({ from, to, subject: 'Welcome', text: 'Your account is ready.' });
}
