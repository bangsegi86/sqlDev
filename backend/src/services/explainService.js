import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Streams a Korean business-level explanation of what a PL/SQL procedure does.
 * Writes SSE events to the Express response object.
 */
export async function explainProcedure(res, source, name, type, analysis) {
  const { params = [], reads = [], writes = [], calls = [], exceptions = [], variables = [] } = analysis;

  const contextLines = [];
  if (params.length) {
    contextLines.push(`파라미터: ${params.map(p => `${p.name}(${p.direction} ${p.dataType})`).join(', ')}`);
  }
  if (reads.length) contextLines.push(`읽는 테이블: ${reads.join(', ')}`);
  if (writes.length) contextLines.push(`쓰는 테이블: ${writes.map(w => `${w.table}(${w.op})`).join(', ')}`);
  if (calls.length) contextLines.push(`호출하는 프로시저/함수: ${calls.map(c => c.name).join(', ')}`);
  if (exceptions.length) contextLines.push(`예외 처리: ${exceptions.join(', ')}`);

  const prompt = `다음은 Oracle PL/SQL ${type}인 "${name}"의 소스 코드와 분석 결과입니다.

분석 결과:
${contextLines.join('\n')}

소스 코드:
\`\`\`sql
${source}
\`\`\`

이 ${type}이 비즈니스 관점에서 궁극적으로 무엇을 처리하려는 것인지 한국어로 설명해 주세요.

다음 항목을 포함해서 설명해 주세요:
1. **핵심 목적**: 이 ${type}이 전체적으로 무엇을 하는 것인지 1~2문장으로 요약
2. **입력 데이터**: 어떤 데이터를 받아서 처리하는지
3. **처리 로직**: 주요 처리 단계 (조건 분기, 반복 처리 등 포함)
4. **출력/결과**: 어떤 데이터를 변경하거나 반환하는지
5. **예외 상황**: 어떤 오류나 예외 상황을 처리하는지

비개발자도 이해할 수 있도록 비즈니스 관점에서 명확하고 친절하게 설명해 주세요.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
}
