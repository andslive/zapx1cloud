export interface Product {
  id: string;
  name: string;
  description: string;
  pitch15s: string;
  pitch30s: string;
  pitch2min: string;
  icp: string;
  differentials: string[];
  pricing: PricingTier[];
  status: 'draft' | 'review' | 'published';
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingTier {
  name: string;
  price: string;
  features: string[];
  recommended?: boolean;
}

export interface CadenceDay {
  day: number;
  title: string;
  trigger: string;
  blocks: CadenceBlock[];
}

export interface CadenceBlock {
  id: string;
  type: 'message' | 'audio' | 'material' | 'cta';
  variant: 'short' | 'medium' | 'long';
  content: string;
  audioScript?: string;
  materialId?: string;
}

export interface Objection {
  id: string;
  category: 'price' | 'trust' | 'timing' | 'thinking' | 'partner' | 'competitor';
  whatTheySay: string;
  whatTheyMean: string;
  suggestedResponse: string;
  followUpQuestion: string;
  proofMaterialId?: string;
}

export interface Material {
  id: string;
  name: string;
  type: 'pdf' | 'video' | 'image' | 'link' | 'banner';
  url: string;
  tags: ('proof' | 'presentation' | 'objection' | 'closing')[];
  objective: string;
  status: 'active' | 'expired';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

export interface PlaybookSection {
  id: string;
  title: string;
  content: string;
  type: 'pitch' | 'icp' | 'objections' | 'comparison' | 'script' | 'closing';
}
