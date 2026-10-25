import { describe, expect, it } from 'vitest';
import { mediaContentType } from '../src/web-handler';

describe('mediaContentType', () => {
  it('keeps a real stored type', () => {
    expect(mediaContentType('audio/mp4', 'media/audio/a.m4a')).toBe('audio/mp4');
  });
  it('infers from the extension when the stored type is generic or missing', () => {
    expect(mediaContentType('application/octet-stream', 'media/audio/a.m4a')).toBe('audio/mp4');
    expect(mediaContentType('', 'media/video/a.MP4')).toBe('video/mp4');
    expect(mediaContentType(undefined, 'media/audio/a.mp3')).toBe('audio/mpeg');
  });
  it('leaves unknown extensions alone', () => {
    expect(mediaContentType('application/octet-stream', 'x/y.bin')).toBe(
      'application/octet-stream',
    );
  });
});
