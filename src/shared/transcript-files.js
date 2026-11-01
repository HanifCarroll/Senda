import { Inflate } from 'fflate';
import { Parser } from 'saxen';

export const TRANSCRIPT_ACCEPT = '.txt,.md,.vtt,.srt,.docx';
export const TRANSCRIPT_MAX_FILE_BYTES = 5000000;
export const TRANSCRIPT_MAX_TEXT_BYTES = 300000;
const DOCX_MAX_XML_BYTES = 8 * 1024 * 1024;
const wordNamespaces = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);
const encoder = new TextEncoder();

const messages = {
  UNSUPPORTED_TRANSCRIPT: 'Choose a TXT, Markdown, VTT, SRT or DOCX file.',
  TRANSCRIPT_FILE_TOO_LARGE: 'Choose a transcript file up to 5 MB.',
  TRANSCRIPT_TEXT_TOO_LARGE: 'The converted text is over 300 KB. Choose a shorter transcript or split it into parts.',
  INVALID_TRANSCRIPT_ENCODING: 'This file is not readable text. Save it as UTF-8 and try again.',
  INVALID_CAPTIONS: 'This subtitle file could not be read. Export it again as VTT or SRT.',
  INVALID_DOCX: 'This Word file could not be read. Re-save it as DOCX and try again.',
  DOCX_CONTENT_TOO_LARGE: 'This Word file is too complex to import. Save it as plain text (TXT) and try again.',
  EMPTY_TRANSCRIPT: 'This file does not contain transcript text.',
  READ_TRANSCRIPT_FAILED: 'This file could not be opened. Choose it again.',
};

export class TranscriptFileError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = 'TranscriptFileError';
    this.code = code;
  }
}
const fail = code => { throw new TranscriptFileError(code); };
const valid = (condition, code = 'INVALID_DOCX') => { if (!condition) fail(code); };

function extension(name) {
  const ext = String(name || '').match(/\.[^.]+$/)?.[0].toLowerCase();
  valid(TRANSCRIPT_ACCEPT.split(',').includes(ext), 'UNSUPPORTED_TRANSCRIPT');
  return ext;
}

function decodeText(bytes) {
  try {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    valid(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text), 'INVALID_TRANSCRIPT_ENCODING');
    return text;
  } catch (error) {
    if (error instanceof TranscriptFileError) throw error;
    fail('INVALID_TRANSCRIPT_ENCODING');
  }
}

function checkedText(text) {
  valid(encoder.encode(text).length <= TRANSCRIPT_MAX_TEXT_BYTES, 'TRANSCRIPT_TEXT_TOO_LARGE');
  valid(text.trim().length > 0, 'EMPTY_TRANSCRIPT');
  return text;
}

const entityCharacters = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeEntities(text, xml = false) {
  if (xml) valid(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text));
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp|lrm|rlm);/g, (entity, name) => {
    if (entityCharacters[name]) return entityCharacters[name];
    if (name === 'nbsp') return '\u00a0';
    if (name === 'lrm') return '\u200e';
    if (name === 'rlm') return '\u200f';
    const point = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    valid([9, 10, 13].includes(point) || (point >= 32 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff), xml ? 'INVALID_DOCX' : 'INVALID_CAPTIONS');
    return String.fromCodePoint(point);
  });
}

function timestamp(text) {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(text);
  valid(match && Number(match[2]) < 60 && Number(match[3]) < 60, 'INVALID_CAPTIONS');
  const milliseconds = ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  valid(Number.isSafeInteger(milliseconds), 'INVALID_CAPTIONS');
  return milliseconds;
}

function captionText(text) {
  return text.replace(/<([^<>\n]*)>/g, (token, tag, offset, all) => {
    const voice = /^v(?:\.[^\s>.]+)*\s+(.+)$/i.exec(tag);
    if (voice) return (offset > 0 && all[offset - 1] !== '\n' ? '\n' : '') + voice[1].trim() + ': ';
    if (/^\/v\s*$/i.test(tag) || /^(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}$/.test(tag)) return '';
    if (/^\/?(?:b|i|u|ruby|rt|c|lang|font)(?:[.\s].*)?$/i.test(tag)) return '';
    return token;
  })
    .replace(/\{\\an[1-9]\}/g, '')
    .split('\n').map(line => decodeEntities(line).trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function captions(text, ext) {
  let blocks = text.split(/\n[\t ]*\n/).map(block => block.trim()).filter(Boolean);
  if (ext === '.vtt') {
    valid(/^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(blocks[0] || ''), 'INVALID_CAPTIONS');
    valid(!blocks[0].includes('-->'), 'INVALID_CAPTIONS');
    blocks = blocks.slice(1);
  }
  const output = [];
  for (const block of blocks) {
    if (ext === '.vtt' && /^(?:NOTE(?:[\t ]|\n|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block)) continue;
    const lines = block.split('\n');
    const timingAt = lines[0].includes('-->') ? 0 : 1;
    const match = /^(\S+)\s+-->\s+(\S+)(?:[\t ].*)?$/.exec(lines[timingAt] || '');
    valid(match, 'INVALID_CAPTIONS');
    valid(timestamp(match[2]) >= timestamp(match[1]), 'INVALID_CAPTIONS');
    const body = lines.slice(timingAt + 1).join('\n');
    valid(!/^\s*(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}\s+-->/m.test(body), 'INVALID_CAPTIONS');
    const speech = captionText(body);
    if (speech) output.push(speech);
  }
  return output.join('\n\n');
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function documentPart(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  valid(end >= 0);
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  valid(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0 && view.getUint16(end + 8, true) === count);
  valid(count > 0 && count <= 2048 && start + size === end);
  let at = start, document;
  const ranges = [];
  for (let index = 0; index < count; index++) {
    valid(at + 46 <= end && view.getUint32(at, true) === 0x02014b50);
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true), originalSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true), next = at + 46 + nameLength + extraLength + commentLength;
    valid(next <= end && view.getUint16(at + 34, true) === 0 && local + 30 <= start);
    valid(compressedSize !== 0xffffffff && originalSize !== 0xffffffff && view.getUint32(local, true) === 0x04034b50);
    const localNameLength = view.getUint16(local + 26, true), localExtraLength = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    valid(dataStart + compressedSize <= start && localNameLength === nameLength);
    valid(view.getUint16(local + 6, true) === flags && view.getUint16(local + 8, true) === method);
    const name = bytes.subarray(at + 46, at + 46 + nameLength);
    valid(name.every((value, index) => bytes[local + 30 + index] === value));
    let dataEnd = dataStart + compressedSize;
    if (flags & 8) {
      valid(dataEnd + 12 <= start);
      if (view.getUint32(dataEnd, true) === 0x08074b50) dataEnd += 4;
      valid(dataEnd + 12 <= start && view.getUint32(dataEnd, true) === crc && view.getUint32(dataEnd + 4, true) === compressedSize && view.getUint32(dataEnd + 8, true) === originalSize);
      dataEnd += 12;
    }
    ranges.push([local, dataEnd]);
    if (new TextDecoder().decode(name) === 'word/document.xml') {
      valid(!document && !(flags & 1) && (method === 0 || method === 8));
      valid(originalSize <= DOCX_MAX_XML_BYTES, 'DOCX_CONTENT_TOO_LARGE');
      if (!(flags & 8)) valid(view.getUint32(local + 14, true) === crc && view.getUint32(local + 18, true) === compressedSize && view.getUint32(local + 22, true) === originalSize);
      document = { compressed: bytes.subarray(dataStart, dataStart + compressedSize), originalSize, method, crc };
    }
    at = next;
  }
  valid(at === end && document);
  ranges.sort((left, right) => left[0] - right[0]);
  valid(ranges.every((range, index) => !index || ranges[index - 1][1] <= range[0]));
  const { compressed, originalSize, method, crc } = document;
  let result;
  if (method === 0) {
    valid(compressed.length === originalSize);
    result = compressed;
  } else {
    const chunks = [];
    let length = 0, complete = false;
    const inflate = new Inflate((chunk, final) => {
      length += chunk.length;
      valid(length <= DOCX_MAX_XML_BYTES, 'DOCX_CONTENT_TOO_LARGE');
      valid(length <= originalSize);
      chunks.push(chunk);
      complete = final;
    });
    for (let offset = 0; offset < compressed.length; offset += 1024)
      inflate.push(compressed.subarray(offset, offset + 1024), offset + 1024 >= compressed.length);
    valid(complete && length === originalSize);
    result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  }
  valid(crc32(result) === crc);
  return result;
}

function wordText(xml) {
  valid(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml));
  const output = [];
  let textBytes = 0, depth = 0, inBody = false, foundBody = false, inText = false, deleted = 0, lastBoundary = null;
  const append = text => {
    textBytes += encoder.encode(text).length;
    valid(textBytes <= TRANSCRIPT_MAX_TEXT_BYTES, 'TRANSCRIPT_TEXT_TOO_LARGE');
    output.push(text);
    lastBoundary = null;
  };
  const boundary = kind => {
    if ((kind === 'cell' && lastBoundary === 'paragraph') || (kind === 'row' && lastBoundary === 'cell')) output.pop();
    output.push(kind === 'cell' ? '\t' : '\n');
    lastBoundary = kind;
  };
  const parser = new Parser({ proxy: true }).ns({ 'http://www.w3.org/XML/1998/namespace': 'xml' });
  const elementName = element => {
    const colon = element.name.indexOf(':');
    if (colon < 0 || !wordNamespaces.has(element.ns[element.name.slice(0, colon) + '$uri'])) return null;
    return 'w:' + element.name.slice(colon + 1);
  };
  parser.on('openTag', element => {
    const name = elementName(element);
    for (const value of Object.values(element.attrs)) decodeEntities(value, true);
    depth++;
    valid(depth <= 256 && (depth !== 1 || name === 'w:document'));
    if (name === 'w:body') { valid(!foundBody && depth === 2); foundBody = inBody = true; }
    if (name === 'w:del' || name === 'w:moveFrom') deleted++;
    if (!inBody || deleted) return;
    if (name === 'w:t') inText = true;
    if (name === 'w:tab') append('\t');
    if (name === 'w:br' || name === 'w:cr') append('\n');
  });
  parser.on('closeTag', element => {
    const name = elementName(element);
    if (name === 'w:del' || name === 'w:moveFrom') deleted--;
    if (inBody && !deleted) {
      if (name === 'w:t') inText = false;
      if (name === 'w:p') boundary('paragraph');
      if (name === 'w:tc') boundary('cell');
      if (name === 'w:tr') boundary('row');
    }
    if (name === 'w:body') inBody = false;
    depth--;
  });
  parser.on('text', value => {
    const text = decodeEntities(value, true);
    if (inBody && inText && !deleted) append(text);
  });
  parser.on('cdata', value => { if (inBody && inText && !deleted) append(value); });
  for (const event of ['error', 'warn', 'attention']) parser.on(event, () => fail('INVALID_DOCX'));
  parser.parse(xml);
  valid(foundBody && depth === 0);
  if (lastBoundary) output.pop();
  return output.join('');
}

export function readTranscriptBytes({ name, bytes }) {
  const ext = extension(name);
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  valid(data instanceof Uint8Array, 'READ_TRANSCRIPT_FAILED');
  valid(data.byteLength <= TRANSCRIPT_MAX_FILE_BYTES, 'TRANSCRIPT_FILE_TOO_LARGE');
  if (ext === '.docx') {
    try { return checkedText(wordText(decodeText(documentPart(data)))); }
    catch (error) {
      if (error instanceof TranscriptFileError && ['DOCX_CONTENT_TOO_LARGE', 'TRANSCRIPT_TEXT_TOO_LARGE', 'EMPTY_TRANSCRIPT'].includes(error.code)) throw error;
      fail('INVALID_DOCX');
    }
  }
  const text = decodeText(data);
  return checkedText(ext === '.vtt' || ext === '.srt' ? captions(text, ext) : text);
}

export async function readTranscriptFile(file) {
  valid(file && typeof file.arrayBuffer === 'function', 'READ_TRANSCRIPT_FAILED');
  extension(file.name);
  valid(Number.isSafeInteger(file.size) && file.size >= 0, 'READ_TRANSCRIPT_FAILED');
  valid(file.size <= TRANSCRIPT_MAX_FILE_BYTES, 'TRANSCRIPT_FILE_TOO_LARGE');
  let bytes;
  try { bytes = await file.arrayBuffer(); }
  catch { fail('READ_TRANSCRIPT_FAILED'); }
  return readTranscriptBytes({ name: file.name, bytes });
}
