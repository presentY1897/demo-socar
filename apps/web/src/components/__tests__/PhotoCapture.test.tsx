import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { photosSchema, type PhotoInput } from '@socar/shared';
import { PhotoCapture } from '@/components/PhotoCapture';
import { jpegFile, stubImagePipeline } from '@/test/image';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

/** PhotoCapture는 제어 컴포넌트라 상위 상태를 흉내내는 껍데기가 필요하다 */
function Host({ onChange, max }: { onChange?: (p: PhotoInput[]) => void; max?: number }) {
  const [photos, setPhotos] = useState<PhotoInput[]>([]);
  return (
    <PhotoCapture
      value={photos}
      max={max}
      onChange={(next) => {
        setPhotos(next);
        onChange?.(next);
      }}
    />
  );
}

const fileInput = () => screen.getByLabelText('사진 촬영');

describe('PhotoCapture — 촬영·압축·미리보기', () => {
  it('파일을 고르면 압축해서 미리보기 썸네일을 그린다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    const onChange = vi.fn();
    const { userEvent } = renderWithProviders(<Host onChange={onChange} />);

    await userEvent.upload(fileInput(), [jpegFile('a.jpg'), jpegFile('b.jpg')]);

    const thumbs = await screen.findAllByRole('img');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute('src', expect.stringContaining('data:image/jpeg;base64,'));
    expect(screen.getByTestId('photo-count')).toHaveTextContent('2/5');

    // 상위로 넘기는 값은 API가 검증하는 shared 계약 그대로여야 한다
    const payload = onChange.mock.lastCall![0];
    expect(photosSchema.safeParse(payload).success).toBe(true);
    expect(payload.every((p: PhotoInput) => p.mime === 'image/jpeg')).toBe(true);
  });

  it('최대 장수를 넘기면 첨부하지 않고 에러를 보여준다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    const onChange = vi.fn();
    const { userEvent } = renderWithProviders(<Host onChange={onChange} max={2} />);

    await userEvent.upload(fileInput(), [jpegFile('a.jpg'), jpegFile('b.jpg'), jpegFile('c.jpg')]);

    expect(await screen.findByRole('alert')).toHaveTextContent('사진은 최대 2장까지 첨부할 수 있어요');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('압축에 실패하면 에러를 보여준다', async () => {
    stubImagePipeline({ bytesPerStep: [5_000_000] });
    const { userEvent } = renderWithProviders(<Host />);

    await userEvent.upload(fileInput(), jpegFile());

    expect(await screen.findByRole('alert')).toHaveTextContent('사진 용량을 줄이지 못했어요');
  });

  it('썸네일의 삭제 버튼을 누르면 그 장만 빠진다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    const { userEvent } = renderWithProviders(<Host />);

    await userEvent.upload(fileInput(), [jpegFile('a.jpg'), jpegFile('b.jpg')]);
    await screen.findByAltText('첨부 사진 2');

    await userEvent.click(screen.getByRole('button', { name: '첨부 사진 1 삭제' }));

    await waitFor(() => expect(screen.queryAllByRole('img')).toHaveLength(1));
    expect(screen.getByTestId('photo-count')).toHaveTextContent('1/5');
  });
});
