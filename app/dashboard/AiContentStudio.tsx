"use client";

import { AiCreationStudio } from "../components/AiCreationStudio";

export function AiContentStudio() {
  return (
    <AiCreationStudio
      mode="selectableCollection"
      eyebrow="Admin"
      title="AI Content Studio"
      description="Generate public ideas into a new collection or an existing collection."
    />
  );
}
