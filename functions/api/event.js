export async function onRequestPost({ request }) {
  const body = await request.text();

  const response = await fetch('https://plausible.io/api/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('User-Agent') || '',
      'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
    },
    body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
