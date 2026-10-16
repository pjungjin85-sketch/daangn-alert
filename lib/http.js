/** JSON 응답. charset 을 밝히지 않으면 브라우저가 한글을 EUC-KR 로 읽어 깨뜨린다. */
export const json = (data, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
