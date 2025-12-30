
export enum RiskLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export enum ContractStance {
  PARTY_A = '甲方 (我方)',
  PARTY_B = '乙方 (我方)',
  NEUTRAL = '中立第三方'
}

export enum ReviewStrictness {
  AGGRESSIVE = '强势 (最大限度争取利益)',
  BALANCED = '均势 (公平公正)',
  LOOSE = '宽松 (促成交易优先)'
}

export enum ModelProvider {
  QWEN = 'Alibaba Qwen Plus (通义千问)',
  KIMI = 'Moonshot Kimi (月之暗面)',
  DOUBAO = 'ByteDance Doubao (字节豆包)',
  GEMINI = 'Google Gemini 3'
}

export interface RiskPoint {
  id: string;
  originalText: string;
  riskDescription: string;
  reason: string;
  level: RiskLevel;
  suggestedText: string;
  isAddressed: boolean;
}

export interface KnowledgeRule {
  id: string;
  category: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
}

export interface SensitiveWord {
  id: string;
  target: string;
  placeholder: string;
}

export interface ContractData {
  fileName: string;
  content: string;
  lastModified: number;
}

export type MaskingMap = Record<string, string>;

export interface PrivacySessionData {
    originalContent: string;
    maskedContent: string;
    maskMap: MaskingMap;
    isMasked: boolean;
}

export interface ReviewSession {
  id: string;
  contract: ContractData;
  risks: RiskPoint[];
  timestamp: number;
  privacyData?: PrivacySessionData;
}