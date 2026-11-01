import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Zip, ZipDeflate, zipSync } from 'fflate';
import {
  TRANSCRIPT_ACCEPT,
  TRANSCRIPT_MAX_FILE_BYTES,
  TRANSCRIPT_MAX_TEXT_BYTES,
  readTranscriptBytes,
  readTranscriptFile,
} from '../src/shared/transcript-files.js';

const encoder = new TextEncoder();
const bytes = text => encoder.encode(text);
const fixture = name => readFileSync(new URL('./fixtures/transcripts/' + name, import.meta.url));
const convert = (name, content) => readTranscriptBytes({ name, bytes: typeof content === 'string' ? bytes(content) : content });
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const word = text => `<w:document xmlns:w="${wordNamespace}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
const docx = (xml = word('Eva: Hello.'), other = {}) => zipSync({
  '[Content_Types].xml': bytes('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  'word/document.xml': bytes(xml),
  ...other,
});
const fails = (code, fn) => assert.throws(fn, error => error.code === code);

test('upload contract accepts common transcript files and separates file and extracted-text limits', () => {
  for (const ext of ['.txt', '.md', '.vtt', '.srt', '.docx']) assert.ok(TRANSCRIPT_ACCEPT.split(',').includes(ext));
  assert.equal(TRANSCRIPT_MAX_FILE_BYTES, 5000000);
  assert.equal(TRANSCRIPT_MAX_TEXT_BYTES, 300000);
});

test('plain text and Markdown retain speech, punctuation and Unicode while normalizing line endings', () => {
  const source = '\ufeff# Interview\r\n\r\nEva: Olá — Türkçe.\r\n  Preserve this indentation.\r\n';
  const expected = '# Interview\n\nEva: Olá — Türkçe.\n  Preserve this indentation.\n';
  for (const name of ['Interview.TXT', 'Interview.md']) assert.equal(convert(name, source), expected);
  const utf16 = new Uint8Array(Buffer.from('\ufeffEva: Hello.\r\n', 'utf16le'));
  assert.equal(convert('utf16.txt', utf16), 'Eva: Hello.\n');
});

test('WebVTT removes metadata, timing, cue settings and markup while preserving speaker turns', () => {
  assert.equal(convert('interview.vtt', fixture('interview.vtt')), [
    'Eva: We receive a booking request\nand check the date.',
    'Luis: What happens if it is unavailable?\nEva: We email the customer & close the request.',
    'Eva: Olá — we also keep Türkçe names.',
  ].join('\n\n'));
});

test('SubRip removes cue numbers, timing and export styling without removing spoken text', () => {
  assert.equal(convert('interview.srt', fixture('interview.srt')), [
    'Eva: We receive a booking request\nand check the date.',
    'Luis: What happens if it is unavailable?\nEva: We email the customer & close the request.',
    'Eva: Olá — we also keep Türkçe names.',
  ].join('\n\n'));
  assert.equal(convert('literal.srt', '1\n00:00:01,000 --> 00:00:02,000\nEva: Type <value> &lt; 5, not a URL.\n'), 'Eva: Type <value> < 5, not a URL.');
});

test('captions preserve supplementary Unicode entities and multiple voice turns in one cue', () => {
  const source = 'WEBVTT\n\n00:00.000 --> 00:02.000\n<v Jos&#233;>Keep &#x1F680; &lt;step&gt; &amp; co.</v> <v Luis>Then continue.</v>\n';
  assert.equal(convert('unicode.vtt', source), 'José: Keep 🚀 <step> & co.\nLuis: Then continue.');
});

test('DOCX retains split runs, paragraphs, line breaks, table turns and hyperlink text without fetching relationships', () => {
  const data = docx(fixture('interview-document.xml').toString(), {
    'word/_rels/document.xml.rels': bytes('<Relationships><Relationship Target="https://do-not-fetch.example.test/private" TargetMode="External"/></Relationships>'),
  });
  const expected = [
    'Photo-session booking interview',
    'Eva: We receive a request & check the date.',
    'Luis: What happens next?',
    'Eva: We email a quote.\nThen we wait for a reply.',
    'Luis:\tWhat if there is no reply?',
    'Eva:\tThe request stays open.',
    'Eva: Olá — keep Türkçe names.',
  ].join('\n');
  assert.equal(convert('interview.docx', data), expected);
  assert.equal(convert('interview.docx', fixture('interview.docx')), expected);
  assert.equal(convert('strict.docx', docx(word('Eva: Strict Word XML.').replaceAll(wordNamespace, 'http://purl.oclc.org/ooxml/wordprocessingml/main'))), 'Eva: Strict Word XML.');
});

test('DOCX extraction ignores unrelated compressed parts instead of expanding the whole archive', () => {
  const data = docx(word('Eva: Small transcript.'), { 'word/media/unused.bin': new Uint8Array(12 * 1024 * 1024) });
  assert.ok(data.length < TRANSCRIPT_MAX_FILE_BYTES);
  assert.equal(convert('with-media.docx', data), 'Eva: Small transcript.');
});

test('DOCX preserves Unicode entities and explicit tabs and breaks', () => {
  const xml = word('Eva: &#x1F680;').replace('</w:t>', '</w:t><w:tab/><w:t>First</w:t><w:br/><w:t>Second</w:t><w:cr/><w:t><![CDATA[Literal <!DOCTYPE text> & names.]]></w:t>');
  assert.equal(convert('unicode.docx', docx(xml)), 'Eva: 🚀\tFirst\nSecond\nLiteral <!DOCTYPE text> & names.');
  assert.equal(convert('break-then-tab.docx', docx(word('Eva: First').replace('</w:t>', '</w:t><w:br/><w:tab/><w:t>Then second.</w:t>'))), 'Eva: First\n\tThen second.');
  assert.equal(convert('trailing-break.docx', docx(word('Eva: First').replace('</w:t>', '</w:t><w:br/>'))), 'Eva: First\n');
  assert.equal(convert('moved-text.docx', docx(word('Eva: Current.').replace('<w:p>', '<w:p><w:moveFrom><w:r><w:t>Old location.</w:t></w:r></w:moveFrom>'))), 'Eva: Current.');
});

test('DOCX accepts stored ZIP entries and streaming data descriptors while rejecting corrupt descriptors', () => {
  assert.equal(convert('stored.docx', zipSync({ 'word/document.xml': bytes(word('Eva: Stored.')) }, { level: 0 })), 'Eva: Stored.');
  const chunks = [];
  const archive = new Zip((error, data) => { if (error) throw error; chunks.push(data); });
  const part = new ZipDeflate('word/document.xml');
  archive.add(part);
  part.push(bytes(word('Eva: Streamed.')), true);
  archive.end();
  const data = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  assert.equal(convert('streamed.docx', data), 'Eva: Streamed.');
  const view = new DataView(data.buffer);
  for (let at = 0; at < data.length - 16; at++) {
    if (view.getUint32(at, true) === 0x08074b50) { view.setUint32(at + 4, 0, true); break; }
  }
  fails('INVALID_DOCX', () => convert('bad-descriptor.docx', data));
});

test('empty or unsupported files and unreadable text return stable actionable errors', () => {
  fails('UNSUPPORTED_TRANSCRIPT', () => convert('interview.pdf', 'Eva: Hello.'));
  fails('EMPTY_TRANSCRIPT', () => convert('empty.txt', '\n \n'));
  fails('INVALID_TRANSCRIPT_ENCODING', () => convert('binary.txt', Uint8Array.of(0xc0, 0xff)));
  fails('INVALID_TRANSCRIPT_ENCODING', () => convert('binary.txt', 'Eva:\u0000Hello.'));
});

test('caption imports reject missing or invalid timing rather than silently dropping speech', () => {
  for (const [name, content] of [
    ['bad.vtt', 'WEBVTT\n\nEva: This has no cue timing.'],
    ['bad.srt', '1\n00:99:00,000 --> 00:00:02,000\nEva: Bad minutes.'],
    ['bad.srt', '1\n00:00:03,000 --> 00:00:02,000\nEva: Reversed time.'],
    ['bad.vtt', '00:00.000 --> 00:01.000\nEva: Missing WEBVTT header.'],
    ['bad.vtt', 'WEBVTT\n00:00.000 --> 00:01.000\nEva: Missing blank line.\n\n00:01.000 --> 00:02.000\nLuis: Second cue.'],
    ['bad.srt', '1\n' + '9'.repeat(400) + ':00:00,000 --> ' + '9'.repeat(400) + ':00:01,000\nEva: Out of range.'],
  ]) fails('INVALID_CAPTIONS', () => convert(name, content));
  fails('EMPTY_TRANSCRIPT', () => convert('empty.vtt', 'WEBVTT\n\nNOTE No actual cues.\n'));
});

test('DOCX rejects truncated archives, invalid Word XML, DTDs and duplicate document parts', () => {
  const valid = docx();
  const duplicate = zipSync({ 'word/document.xml': bytes(word('One.')), 'word/anotherx.xml': bytes(word('Two.')) });
  const replacement = bytes('word/document.xml');
  const original = bytes('word/anotherx.xml');
  // Equal length names make a duplicate central-directory target without rewriting offsets.
  assert.equal(replacement.length, original.length);
  for (let at = 0; at <= duplicate.length - original.length; at++) {
    if (original.every((value, i) => duplicate[at + i] === value)) duplicate.set(replacement, at);
  }
  for (const data of [
    valid.subarray(0, valid.length - 12),
    bytes('This is not a ZIP file.'),
    zipSync({ 'notes.txt': bytes('No Word document.') }),
    docx('<w:document xmlns:w="' + wordNamespace + '"><w:body><w:p></w:body></w:document>'),
    docx('<!DOCTYPE doc [<!ENTITY secret SYSTEM "file:///etc/passwd">]>' + word('&secret;')),
    docx('<document><body>Not Word XML.</body></document>'),
    docx('<w:document><w:body><w:p><w:r><w:t>Undeclared namespace.</w:t></w:r></w:p></w:body></w:document>'),
    docx(word('&undeclared;')),
    docx(word('&#xD800;')),
    docx(word('&#x110000;')),
    docx(word('Invalid XML character: \uffff')),
    docx(word('Hello.').replace('<w:r>', '<w:r bogus="&undeclared;">')),
    duplicate,
  ]) fails('INVALID_DOCX', () => convert('bad.docx', data));
});

test('input limits are checked before file reads and extracted limits count UTF-8 bytes', async () => {
  let read = false;
  await assert.rejects(readTranscriptFile({ name: 'large.docx', size: TRANSCRIPT_MAX_FILE_BYTES + 1, arrayBuffer: async () => { read = true; } }), { code: 'TRANSCRIPT_FILE_TOO_LARGE' });
  assert.equal(read, false);
  fails('TRANSCRIPT_FILE_TOO_LARGE', () => convert('large.txt', new Uint8Array(TRANSCRIPT_MAX_FILE_BYTES + 1)));
  assert.equal(convert('limit.txt', 'a'.repeat(TRANSCRIPT_MAX_TEXT_BYTES)).length, TRANSCRIPT_MAX_TEXT_BYTES);
  assert.equal(convert('limit.docx', docx(word('a'.repeat(TRANSCRIPT_MAX_TEXT_BYTES)))).length, TRANSCRIPT_MAX_TEXT_BYTES);
  fails('TRANSCRIPT_TEXT_TOO_LARGE', () => convert('long.txt', 'é'.repeat(TRANSCRIPT_MAX_TEXT_BYTES / 2 + 1)));
  fails('TRANSCRIPT_TEXT_TOO_LARGE', () => convert('long.docx', docx(word('a'.repeat(TRANSCRIPT_MAX_TEXT_BYTES + 1)))));
});

test('DOCX expansion is bounded even when a compressed part is small or lies about its expanded size', () => {
  const bomb = docx(word('a'.repeat(9 * 1024 * 1024)));
  assert.ok(bomb.length < TRANSCRIPT_MAX_FILE_BYTES);
  fails('DOCX_CONTENT_TOO_LARGE', () => convert('bomb.docx', bomb));
  const lying = new Uint8Array(bomb), view = new DataView(lying.buffer);
  for (let at = 0; at < lying.length - 46; at++) {
    if (view.getUint32(at, true) === 0x02014b50 && new TextDecoder().decode(lying.subarray(at + 46, at + 63)) === 'word/document.xml') {
      view.setUint32(at + 24, 20, true);
      view.setUint32(view.getUint32(at + 42, true) + 22, 20, true);
      break;
    }
  }
  fails('INVALID_DOCX', () => convert('lying.docx', lying));
});

test('DOCX rejects corrupt payloads and inconsistent local checksums', () => {
  const data = docx();
  for (const localOnly of [false, true]) {
    const corrupt = new Uint8Array(data), view = new DataView(corrupt.buffer);
    for (let at = 0; at < corrupt.length - 46; at++) {
      if (view.getUint32(at, true) !== 0x02014b50 || new TextDecoder().decode(corrupt.subarray(at + 46, at + 63)) !== 'word/document.xml') continue;
      const local = view.getUint32(at + 42, true);
      if (localOnly) view.setUint32(local + 14, view.getUint32(local + 14, true) ^ 1, true);
      else corrupt[local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)] ^= 1;
      break;
    }
    fails('INVALID_DOCX', () => convert('corrupt.docx', corrupt));
  }
});

test('File-like imports use the same converter and surface a read failure without private error text', async () => {
  const data = fixture('interview.srt');
  assert.equal(await readTranscriptFile({ name: 'interview.SRT', size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) }), convert('interview.srt', data));
  await assert.rejects(readTranscriptFile({ name: 'unreadable.txt', size: 10, arrayBuffer: async () => { throw new Error('private local path'); } }), error => error.code === 'READ_TRANSCRIPT_FAILED' && !error.message.includes('private local path'));
});
