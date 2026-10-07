import { useDropzone } from "react-dropzone";
import { Icon } from "./Icon";

interface ImageDropzoneProps {
  title: string;
  preview: string | null;
  showReplaceHint?: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}

const ACCEPT = {
  "image/jpeg": [],
  "image/png": [],
  "image/webp": [],
  "image/gif": [],
};

export function ImageDropzone({ title, preview, showReplaceHint, onFile, onError }: ImageDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    onDropAccepted: (files) => {
      onError("");
      onFile(files[0]);
    },
    onDropRejected: () => onError("Please choose a single JPEG, PNG, WebP, or GIF image."),
  });

  return (
    <div {...getRootProps({ className: `dropzone${isDragActive ? " dragover" : ""}` })}>
      <input {...getInputProps()} />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dz-preview" src={preview} alt="Selected image preview" />
          {showReplaceHint && <span className="dz-replace">Click or drop to replace</span>}
        </>
      ) : (
        <div className="dz-empty">
          <Icon name="upload" />
          <div className="big">{title}</div>
          <div className="small">or click to browse · JPEG PNG WebP GIF</div>
        </div>
      )}
    </div>
  );
}
