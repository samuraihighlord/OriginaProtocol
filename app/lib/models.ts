export const MODEL_OPTIONS = [
  { value: "midjourney-v6", label: "Midjourney v6" },
  { value: "dall-e-3", label: "DALL-E 3" },
  { value: "stable-diffusion-xl", label: "Stable Diffusion XL" },
  { value: "sora-1.0", label: "Sora 1.0" },
  { value: "adobe-firefly-2", label: "Adobe Firefly 2" },
  { value: "flux-1", label: "Flux 1" },
  { value: "ideogram-v2", label: "Ideogram v2" },
  { value: "custom", label: "Custom" },
];

export function modelLabel(id: string): string {
  return MODEL_OPTIONS.find((m) => m.value === id)?.label ?? id;
}
