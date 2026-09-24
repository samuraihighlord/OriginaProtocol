import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as styles from "../styles";

interface ImageDropProps {
  label: string;
  onFile: (file: File, bytes: Uint8Array, previewUrl: string) => void;
}

export function ImageDrop({ label, onFile }: ImageDropProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const url = URL.createObjectURL(file);

      setPreviewUrl(url);
      onFile(file, bytes, url);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  return (
    <div {...getRootProps()} style={styles.dropzone(isDragActive)}>
      <input {...getInputProps()} />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="preview" style={styles.previewImg} />
      ) : (
        <span>{isDragActive ? "Drop the image here" : label}</span>
      )}
    </div>
  );
}
