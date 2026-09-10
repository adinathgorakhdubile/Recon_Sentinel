import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Video, Square, Trash2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { PocAttachment } from "@/types";
import { uid } from "@/lib/seed";

interface Props {
  attachments: PocAttachment[];
  onChange: (next: PocAttachment[]) => void;
}

const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8MB per finding — keep localStorage sane

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => res(r.result as string);
    r.readAsDataURL(blob);
  });
}

export function PocCapture({ attachments, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const totalBytes = attachments.reduce((n, a) => n + a.sizeBytes, 0);

  function push(att: PocAttachment) {
    if (totalBytes + att.sizeBytes > MAX_TOTAL_BYTES) {
      toast.error("PoC storage limit reached (8MB per finding). Delete an old capture first.");
      return;
    }
    onChange([...attachments, att]);
  }

  async function screenshot() {
    if (busy) return;
    setBusy(true);
    try {
      // @ts-ignore
      const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      // Give the browser a tick to paint
      await new Promise((r) => setTimeout(r, 250));
      // @ts-ignore ImageCapture may not exist in TS lib
      const IC = (window as any).ImageCapture;
      let bitmap: ImageBitmap;
      if (IC) {
        bitmap = await new IC(track).grabFrame();
      } else {
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        bitmap = await createImageBitmap(video);
        video.pause();
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png", 0.92)!);
      track.stop();
      stream.getTracks().forEach((t) => t.stop());
      const dataUrl = await blobToDataUrl(blob);
      push({
        id: uid("poc"), kind: "screenshot", mime: "image/png",
        dataUrl, sizeBytes: blob.size, createdAt: Date.now(),
        caption: `Screenshot ${new Date().toLocaleTimeString()}`,
      });
      toast.success("Screenshot captured");
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") toast.error(e?.message ?? "Screenshot failed");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (busy || recording) return;
    setBusy(true);
    try {
      const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800_000 });
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        if (blob.size > MAX_TOTAL_BYTES) {
          toast.error(`Recording too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Keep it under 8MB — try shorter clip.`);
          return;
        }
        const dataUrl = await blobToDataUrl(blob);
        push({
          id: uid("poc"), kind: "recording", mime,
          dataUrl, sizeBytes: blob.size, createdAt: Date.now(),
          caption: `Recording ${new Date().toLocaleTimeString()}`,
        });
        toast.success("Recording saved");
      };
      // Stop if user cancels share via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (rec.state !== "inactive") rec.stop();
      });
      recorderRef.current = rec;
      rec.start(500);
      setRecording(true);
      toast.info("Recording started. Click Stop when done.");
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") toast.error(e?.message ?? "Recording failed");
    } finally {
      setBusy(false);
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  async function onFile(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const isImg = file.type.startsWith("image/");
      const isVid = file.type.startsWith("video/");
      if (!isImg && !isVid) { toast.error(`Skipped ${file.name}: not image/video`); continue; }
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        toast.error(`${file.name}: exceeds 8MB budget`);
        continue;
      }
      const dataUrl = await blobToDataUrl(file);
      push({
        id: uid("poc"), kind: isImg ? "screenshot" : "recording",
        mime: file.type, dataUrl, sizeBytes: file.size, createdAt: Date.now(),
        caption: file.name,
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-widest text-primary/70">PoC captures</div>
        <div className="text-[10px] mono text-muted-foreground">
          {(totalBytes / 1024).toFixed(0)} / {(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB · {attachments.length} file(s)
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={screenshot} disabled={busy || recording}>
          <Camera className="h-3.5 w-3.5 mr-1.5" /> Screenshot
        </Button>
        {!recording ? (
          <Button size="sm" variant="outline" onClick={startRecording} disabled={busy}>
            <Video className="h-3.5 w-3.5 mr-1.5" /> Record screen
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-3.5 w-3.5 mr-1.5" /> Stop recording
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Upload
        </Button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={(e) => onFile(e.target.files)} />
      </div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group rounded border border-border/60 overflow-hidden bg-background/40">
              {a.kind === "screenshot" ? (
                <img src={a.dataUrl} alt={a.caption} className="w-full h-24 object-cover" />
              ) : (
                <video src={a.dataUrl} className="w-full h-24 object-cover" controls />
              )}
              <div className="px-2 py-1 text-[10px] mono text-muted-foreground truncate">{a.caption}</div>
              <button onClick={() => remove(a.id)}
                className="absolute top-1 right-1 bg-background/80 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove">
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        Screen capture uses the browser's native picker — pick the window/tab you want. Stored locally in your workspace only.
      </div>
    </div>
  );
}
