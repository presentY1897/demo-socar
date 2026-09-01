import { PHOTO_MIME } from '@socar/shared';
import { toPhotoRows, toStoredPhotos, totalPhotoBytes } from './photo-storage';

const b64 = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');

describe('사진 저장 공통 경로', () => {
  it('업로드 입력을 DB 행으로 바꾸며 바이트 수를 서버에서 다시 계산한다', () => {
    const rows = toPhotoRows([
      { mime: PHOTO_MIME, data: b64(1234) },
      { mime: PHOTO_MIME, data: b64(200 * 1024) },
    ]);
    expect(rows.map((r) => r.bytes)).toEqual([1234, 200 * 1024]);
    expect(rows[0].mime).toBe(PHOTO_MIME);
    expect(totalPhotoBytes(rows)).toBe(1234 + 200 * 1024);
  });

  it('저장된 사진을 화면이 바로 쓰는 data: URI로 내려준다', () => {
    const data = b64(9);
    const [view] = toStoredPhotos([{ id: 'photo-1', mime: PHOTO_MIME, data, bytes: 9 }]);
    expect(view).toEqual({
      id: 'photo-1',
      mime: PHOTO_MIME,
      bytes: 9,
      dataUri: `data:${PHOTO_MIME};base64,${data}`,
    });
    // 원본 base64는 응답에 그대로 노출되지 않는다 (data: URI 안에만 있다)
    expect(Object.keys(view)).not.toContain('data');
  });
});
