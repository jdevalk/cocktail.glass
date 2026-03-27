export async function onRequest() {
  const response = await fetch('https://plausible.io/js/script.outbound-links.file-downloads.js');
  const body = await response.text();

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
