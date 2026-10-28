// Keep previews and the local test outbox portable, then supply actual bytes
// to the Workers binding. String content arrived as literal base64 text in MIME.
export function emailForDelivery(message) {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      content: Uint8Array.from(atob(attachment.content), (char) => char.charCodeAt(0)).buffer,
    })),
  };
}
