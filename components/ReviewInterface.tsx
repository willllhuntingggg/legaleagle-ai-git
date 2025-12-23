import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ContractData, ContractStance, ReviewStrictness, RiskPoint, RiskLevel, ReviewSession, PrivacySessionData, MaskingMap, ModelProvider, KnowledgeRule } from '../types';
import { analyzeContractRisks } from '../services/geminiService';
import { Check, X, ArrowRight, Download, Loader2, Sparkles, Wand2, ChevronLeft, ChevronRight, AlertTriangle, Shield, PieChart, Eye, EyeOff, Lock, Play, RotateCcw, CheckCircle2, Cpu, Key } from 'lucide-react';
import * as Diff from 'diff';

interface ReviewInterfaceProps {
  contract: ContractData;
  initialSession?: ReviewSession | null;
  privacyData?: PrivacySessionData | null;
  knowledgeRules: KnowledgeRule[];
  onSaveSession: (session: ReviewSession) => void;
  onBack: () => void;
}

const STANDARD_LEGAL_GUIDELINES = `
- Liability Caps: Ensure total liability is limited to 100% of the contract value; avoid unlimited liability.
- Payment Terms: Standard payment period should not exceed 60 days.
- Termination: Ensure mutual termination rights with reasonable notice periods (e.g., 30 days).
- Confidentiality: Standard confidentiality clauses should protect both parties' sensitive information.
- Force Majeure: Check for clear definitions and notice requirements.
- Indemnification: Ensure indemnity obligations are balanced and not one-sided.
`;

export const ReviewInterface: React.FC<ReviewInterfaceProps> = ({ contract, initialSession, privacyData, knowledgeRules, onSaveSession, onBack }) => {
  const [currentText, setCurrentText] = useState(privacyData?.maskedContent || contract.content);
  const [risks, setRisks] = useState<RiskPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  
  const [isMaskedView, setIsMaskedView] = useState(!!privacyData);
  const maskMap = useMemo(() => privacyData?.maskMap || {}, [privacyData]);

  const [stance, setStance] = useState<ContractStance>(ContractStance.NEUTRAL);
  const [strictness, setStrictness] = useState<ReviewStrictness>(ReviewStrictness.BALANCED);
  const [modelProvider, setModelProvider] = useState<ModelProvider>(ModelProvider.QWEN); 
  const [apiKey, setApiKey] = useState('');

  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  
  const [history, setHistory] = useState<{text: string, risks: RiskPoint[], selectedId: string | null}[]>([]);
  const [isAnimatingSuccess, setIsAnimatingSuccess] = useState(false);
  const [animatingRiskId, setAnimatingRiskId] = useState<string | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docContainerRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<{[key: string]: HTMLSpanElement | null}>({});

  useEffect(() => {
    if (initialSession) {
        const sessionText = initialSession.privacyData?.maskedContent || initialSession.contract.content;
        setCurrentText(sessionText);
        setRisks(initialSession.risks);
        if (initialSession.privacyData) {
            setIsMaskedView(true);
        }
    } else {
        setCurrentText(privacyData?.maskedContent || contract.content);
        setRisks([]);
        setSelectedRiskId(null);
    }
  }, [contract, initialSession, privacyData]);

  useEffect(() => {
      const savedKey = localStorage.getItem(`apikey_${modelProvider}`);
      if (savedKey) {
          setApiKey(savedKey);
      } else {
          setApiKey('');
      }
  }, [modelProvider]);

  const handleApiKeyChange = (val: string) => {
      setApiKey(val);
      localStorage.setItem(`apikey_${modelProvider}`, val);
  };

  const visibleRisks = useMemo(() => {
    return risks.filter(r => {
        if (r.isAddressed) return true;
        return currentText.includes(r.originalText);
    });
  }, [risks, currentText]);

  const sortedActiveRisks = useMemo(() => {
    return visibleRisks
      .filter(r => !r.isAddressed)
      .sort((a, b) => {
          const idxA = currentText.indexOf(a.originalText);
          const idxB = currentText.indexOf(b.originalText);
          return idxA - idxB;
      });
  }, [visibleRisks, currentText]);

  useEffect(() => {
    if (selectedRiskId && highlightRefs.current[selectedRiskId]) {
        highlightRefs.current[selectedRiskId]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
  }, [selectedRiskId]);

  const unmaskText = (text: string): string => {
      if (!text) return '';
      let result = text;
      const placeholders = Object.keys(maskMap).sort((a, b) => b.length - a.length);
      for (const placeholder of placeholders) {
          result = result.split(placeholder).join(maskMap[placeholder]);
      }
      return result;
  };

  const handleAnalyze = async () => {
    if (!apiKey) {
        alert("请输入 API Key 后再开始审查");
        return;
    }

    setLoading(true);
    setLoadingStep(`正在调用 ${modelProvider.split(' ')[0]} 分析合同条款...`);
    
    // 构建知识库上下文：始终包含标准准则 + 用户自定义准则
    const customRulesText = knowledgeRules.length > 0 
        ? knowledgeRules.map(r => `[${r.name}] (${r.riskLevel}风险): ${r.description}`).join('\n')
        : "No custom rules provided.";

    const rulesContext = `
[STANDARD COMMERCIAL RULES (BASELINE)]:
${STANDARD_LEGAL_GUIDELINES}

[USER-DEFINED CUSTOM KNOWLEDGE RULES]:
${customRulesText}
    `.trim();
    
    try {
      const identifiedRisks = await analyzeContractRisks(currentText, stance, strictness, rulesContext, modelProvider, apiKey);
      
      const sortedRisks = identifiedRisks.sort((a, b) => {
          return currentText.indexOf(a.originalText) - currentText.indexOf(b.originalText);
      });

      setRisks(sortedRisks);
      setLoadingStep('');
      setHistory([]); 
      
      onSaveSession({
          id: Date.now().toString(),
          contract: { ...contract, content: currentText },
          risks: sortedRisks,
          timestamp: Date.now(),
          privacyData: privacyData || undefined
      });

    } catch (e: any) {
      console.error(e);
      alert(`分析失败: ${e.message || '请检查 API Key 或网络连接'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRisk = (riskId: string) => {
    setSelectedRiskId(riskId);
    setTimeout(() => {
        const el = highlightRefs.current[riskId];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 50);
  };

  const handleNavigationBack = () => {
    if (risks.length > 0 && !initialSession) {
        setRisks([]);
        setHistory([]);
    } else {
        onBack();
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
    }
    setIsAnimatingSuccess(false);
    setAnimatingRiskId(null);

    const prev = history[history.length - 1];
    setCurrentText(prev.text);
    setRisks(prev.risks);
    
    if (prev.selectedId) {
        setSelectedRiskId(prev.selectedId);
        setTimeout(() => {
            const el = highlightRefs.current[prev.selectedId!];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    
    setHistory(prevHistory => prevHistory.slice(0, -1));
  };

  const handleAcceptRisk = (risk: RiskPoint) => {
    setHistory(prev => [...prev, { text: currentText, risks, selectedId: selectedRiskId }]);
    const currentIndex = sortedActiveRisks.findIndex(r => r.id === risk.id);
    let nextRiskId: string | null = null;
    
    if (currentIndex !== -1 && sortedActiveRisks.length > 1) {
        if (currentIndex < sortedActiveRisks.length - 1) {
             nextRiskId = sortedActiveRisks[currentIndex + 1].id;
        } else {
             nextRiskId = sortedActiveRisks[0].id;
        }
    } else if (sortedActiveRisks.length === 1) {
        nextRiskId = null;
    }

    setAnimatingRiskId(risk.id);
    setIsAnimatingSuccess(true);

    const newText = currentText.replace(risk.originalText, risk.suggestedText);
    const updatedRisks = risks.map(r => r.id === risk.id ? { ...r, isAddressed: true } : r);
    
    setCurrentText(newText);
    setRisks(updatedRisks);
    
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    
    transitionTimeoutRef.current = setTimeout(() => {
        setIsAnimatingSuccess(false);
        setAnimatingRiskId(null);
        if (nextRiskId) {
            handleSelectRisk(nextRiskId);
        } else {
            setSelectedRiskId(null);
        }
    }, 1500); 
  };

  const handleIgnoreRisk = (riskId: string) => {
     setHistory(prev => [...prev, { text: currentText, risks, selectedId: selectedRiskId }]);
     const currentIndex = sortedActiveRisks.findIndex(r => r.id === riskId);
     let nextRiskId: string | null = null;
     if (currentIndex !== -1 && sortedActiveRisks.length > 1) {
         if (currentIndex < sortedActiveRisks.length - 1) {
              nextRiskId = sortedActiveRisks[currentIndex + 1].id;
         } else {
              nextRiskId = sortedActiveRisks[0].id;
         }
     }

    const updatedRisks = risks.map(r => r.id === riskId ? { ...r, isAddressed: true } : r);
    setRisks(updatedRisks);
    
    if (nextRiskId) {
        handleSelectRisk(nextRiskId);
    } else {
        setSelectedRiskId(null);
    }
  };

  const navigateRisk = (direction: 'next' | 'prev') => {
      if (sortedActiveRisks.length === 0) return;

      let currentIndex = sortedActiveRisks.findIndex(r => r.id === selectedRiskId);
      
      if (currentIndex === -1) {
          currentIndex = -1;
      }

      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (nextIndex >= sortedActiveRisks.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = sortedActiveRisks.length - 1;

      handleSelectRisk(sortedActiveRisks[nextIndex].id);
  };

  const jumpToFirstRisk = (level?: RiskLevel) => {
      const target = sortedActiveRisks.find(r => !level || r.level === level);
      if (target) {
          handleSelectRisk(target.id);
      }
  };

  const downloadContract = () => {
    const finalContent = unmaskText(currentText);
    const element = document.createElement("a");
    const file = new Blob([finalContent], {type: 'application/msword'});
    element.href = URL.createObjectURL(file);
    element.download = `Reviewed_${contract.fileName}.doc`;
    document.body.appendChild(element);
    element.click();
  };

  const renderDocumentContent = () => {
    const segmentsToHighlight = [
        ...sortedActiveRisks.map(r => ({ ...r, matchText: r.originalText, isAnimating: false })),
    ];
    
    if (animatingRiskId) {
        const animatingRisk = risks.find(r => r.id === animatingRiskId);
        if (animatingRisk) {
            segmentsToHighlight.push({
                ...animatingRisk,
                matchText: animatingRisk.suggestedText,
                isAnimating: true
            });
        }
    }

    const sortedSegments = segmentsToHighlight
        .filter(s => currentText.indexOf(s.matchText) !== -1)
        .sort((a, b) => currentText.indexOf(a.matchText) - currentText.indexOf(b.matchText));

    let parts: { text: string; riskId?: string; level?: RiskLevel; isAnimating?: boolean }[] = [{ text: currentText }];
    
    sortedSegments.forEach(segment => {
      const newParts: typeof parts = [];
      parts.forEach(part => {
        if (part.riskId) {
          newParts.push(part);
          return;
        }
        
        const split = part.text.split(segment.matchText);
        if (split.length > 1) {
          for (let i = 0; i < split.length; i++) {
            newParts.push({ text: split[i] });
            if (i < split.length - 1) {
              newParts.push({ 
                  text: segment.matchText, 
                  riskId: segment.id, 
                  level: segment.level, 
                  isAnimating: segment.isAnimating 
                });
            }
          }
        } else {
          newParts.push(part);
        }
      });
      parts = newParts;
    });

    return (
      <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 pb-[80vh] scroll-mt-32">
        {parts.map((part, idx) => {
           const displayText = (!isMaskedView && privacyData) ? unmaskText(part.text) : part.text;
           
           if (part.riskId) {
               if (part.isAnimating) {
                   return (
                       <span 
                            key={idx}
                            id={`highlight-${part.riskId}`}
                            ref={el => { highlightRefs.current[part.riskId!] = el; }}
                            className="bg-green-100 text-green-800 ring-2 ring-green-400/50 rounded px-1 transition-all duration-1000 ease-out animate-in fade-in zoom-in-95"
                       >
                           {displayText}
                       </span>
                   )
               }

               return (
                <span 
                  key={idx} 
                  id={`highlight-${part.riskId}`}
                  ref={el => { highlightRefs.current[part.riskId!] = el; }}
                  onClick={() => handleSelectRisk(part.riskId!)}
                  className={`cursor-pointer border-b-2 transition-colors duration-200 scroll-mt-32 ${
                    selectedRiskId === part.riskId ? 'bg-blue-600 text-white border-blue-800 px-1 rounded shadow-sm' :
                    part.level === RiskLevel.HIGH ? 'bg-red-50 border-red-500 hover:bg-red-100' : 
                    part.level === RiskLevel.MEDIUM ? 'bg-orange-50 border-orange-500 hover:bg-orange-100' : 
                    'bg-yellow-50 border-yellow-500 hover:bg-yellow-100'
                  }`}
                >
                  {displayText}
                </span>
              );
           } 
           
           return <span key={idx}>{displayText}</span>;
        })}
      </div>
    );
  };

  const selectedRisk = risks.find(r => r.id === selectedRiskId);
  const activeCount = sortedActiveRisks.length;
  const currentIndexDisplay = selectedRisk && !selectedRisk.isAddressed 
      ? sortedActiveRisks.findIndex(r => r.id === selectedRisk.id) + 1 
      : '-';

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Undo Toast */}
      {history.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur text-white pl-6 pr-4 py-3 rounded-full shadow-xl flex items-center gap-6 animate-in slide-in-from-bottom-4 z-[70] border border-slate-700/50">
              <span className="text-sm font-medium">上一步操作已保存</span>
              <button 
                onClick={handleUndo} 
                className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors text-sm font-bold bg-white/10 px-3 py-1 rounded-full hover:bg-white/20"
              >
                  <RotateCcw className="w-3.5 h-3.5" /> 撤销
              </button>
          </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleNavigationBack} className="text-gray-500 hover:text-gray-700">
            <ArrowRight className="rotate-180 w-5 h-5" />
          </button>
          <div>
            <h2 className="font-semibold text-lg text-gray-800 flex items-center gap-2">
                {contract.fileName}
                {privacyData && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        已脱敏
                    </span>
                )}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {risks.length > 0 && (
            <button 
                onClick={downloadContract}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
                <Download className="w-4 h-4" />
                {privacyData ? '复敏下载' : '下载合同'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Document View */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 relative scroll-smooth" ref={docContainerRef}>
          <div className="max-w-4xl mx-auto bg-white min-h-[1000px] shadow-lg p-12 rounded-sm border border-gray-200">
             {renderDocumentContent()}
          </div>
        </div>

        {/* Right: Layout Column */}
        <div className="w-[450px] bg-white border-l border-gray-200 flex flex-col shadow-2xl z-20 relative">
          
          {/* 1. Configuration State */}
          {risks.length === 0 && (
            <div className="p-8 h-full overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-4">
                    <Sparkles className="w-6 h-6 text-purple-600" />
                    开始审查
                  </h3>
                  <p className="text-gray-500">
                    配置您的审查立场，AI 将基于内置和您自定义的知识库为您排查风险。
                  </p>
                  {privacyData && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                          <Lock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 leading-relaxed">
                              当前处于隐私保护模式。AI 将仅能看到脱敏后的文本 (如 [PARTY_A])。
                          </p>
                      </div>
                  )}
                </div>

                <div className="space-y-5 bg-slate-50 p-6 rounded-xl border border-slate-100">
                   <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">模型引擎</label>
                    <div className="relative">
                        <select 
                            value={modelProvider}
                            onChange={(e) => {
                                setModelProvider(e.target.value as ModelProvider);
                            }}
                            className="w-full p-3 pl-10 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                        >
                            <option value={ModelProvider.QWEN}>{ModelProvider.QWEN}</option>
                            <option value={ModelProvider.KIMI}>{ModelProvider.KIMI}</option>
                            <option value={ModelProvider.DOUBAO}>{ModelProvider.DOUBAO}</option>
                            <option value={ModelProvider.GEMINI}>{ModelProvider.GEMINI}</option>
                        </select>
                        <Cpu className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" />
                    </div>
                  </div>

                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        API Key <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <input 
                            type="password"
                            value={apiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                            placeholder={`请输入 ${modelProvider.split(' ')[0]} API Key`}
                            className="w-full p-3 pl-10 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <Key className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">我方立场</label>
                    <select 
                      value={stance}
                      onChange={(e) => setStance(e.target.value as ContractStance)}
                      className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {Object.values(ContractStance).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">审查力度</label>
                    <select 
                      value={strictness}
                      onChange={(e) => setStrictness(e.target.value as ReviewStrictness)}
                      className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {Object.values(ReviewStrictness).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-bold text-purple-700">知识库状态</span>
                    </div>
                    <p className="text-[10px] text-purple-500 leading-tight">
                        已加载标准准则 + {knowledgeRules.length} 条自定义规则。
                    </p>
                </div>

                <button 
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-3 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
                >
                  {loading ? (
                    <>
                        <Loader2 className="animate-spin w-6 h-6" />
                        {loadingStep || '处理中...'}
                    </>
                  ) : (
                    <>
                        <Wand2 className="w-6 h-6" />
                        一键审查
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {risks.length > 0 && (
            <div className="flex flex-col h-full bg-slate-50/50">
                <div className="p-6 border-b bg-white">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-blue-500" />
                        审查概览
                    </h3>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div onClick={() => jumpToFirstRisk()} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 cursor-pointer transition-all group">
                            <div className="text-3xl font-bold text-gray-800 mb-1 group-hover:text-blue-600">{visibleRisks.length}</div>
                            <div className="text-xs text-gray-500 uppercase font-medium">风险总数</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-3xl font-bold text-green-600 mb-1">{visibleRisks.filter(r => r.isAddressed).length}</div>
                            <div className="text-xs text-gray-500 uppercase font-medium">已处理</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                            <span className="text-xs font-bold text-gray-500 uppercase">风险分布</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                            <div onClick={() => jumpToFirstRisk(RiskLevel.HIGH)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-red-500"></div><span className="text-sm font-medium text-gray-700">高风险</span></div>
                                <span className="text-sm font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{sortedActiveRisks.filter(r => r.level === RiskLevel.HIGH).length}</span>
                            </div>
                            <div onClick={() => jumpToFirstRisk(RiskLevel.MEDIUM)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-orange-500"></div><span className="text-sm font-medium text-gray-700">中风险</span></div>
                                <span className="text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{sortedActiveRisks.filter(r => r.level === RiskLevel.MEDIUM).length}</span>
                            </div>
                            <div onClick={() => jumpToFirstRisk(RiskLevel.LOW)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-yellow-500"></div><span className="text-sm font-medium text-gray-700">低风险</span></div>
                                <span className="text-sm font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">{sortedActiveRisks.filter(r => r.level === RiskLevel.LOW).length}</span>
                            </div>
                        </div>
                    </div>

                    {activeCount > 0 ? (
                        <>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex gap-4 items-start">
                                <AlertTriangle className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                                <div><h4 className="text-sm font-bold text-blue-800 mb-1">待处理事项</h4><p className="text-sm text-blue-600">标记了 <strong>{activeCount}</strong> 处风险点。</p></div>
                            </div>
                            <button onClick={() => jumpToFirstRisk()} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98]">
                                <Play className="w-5 h-5 fill-current" />开始处理
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4"><Shield className="w-8 h-8 text-green-600" /></div>
                            <h3 className="font-bold text-gray-800">审查完成</h3>
                        </div>
                    )}
                     <div className="pt-4 border-t border-gray-200">
                        <button onClick={() => { setRisks([]); }} className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">重新开始</button>
                     </div>
                </div>
            </div>
          )}
        </div>
      </div>

      {selectedRisk && (
        <div className="fixed top-0 right-0 bottom-0 w-[450px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-300">
            {isAnimatingSuccess ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce"><CheckCircle2 className="w-10 h-10 text-green-600" /></div>
                    <h3 className="text-2xl font-bold text-gray-800">已采纳修改</h3>
                </div>
            ) : (
                <>
                    <div className="p-4 pt-6 border-b flex items-center justify-between bg-slate-50">
                        <button onClick={() => setSelectedRiskId(null)} className="text-gray-500 hover:text-gray-800 text-sm font-medium">返回概览</button>
                        <div className="flex items-center gap-1">
                            <button onClick={() => navigateRisk('prev')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><ChevronLeft className="w-5 h-5" /></button>
                            <span className="text-xs text-gray-400 font-mono">{currentIndexDisplay} / {activeCount}</span>
                            <button onClick={() => navigateRisk('next')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600"><ChevronRight className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${selectedRisk.level === RiskLevel.HIGH ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{selectedRisk.level} Risk</span>
                        <h3 className="text-xl font-bold text-gray-900 mt-4 mb-3">{selectedRisk.riskDescription}</h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-6 text-gray-600 text-sm leading-relaxed">{selectedRisk.reason}</div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-8"><DiffViewer oldValue={(!isMaskedView && privacyData) ? unmaskText(selectedRisk.originalText) : selectedRisk.originalText} newValue={(!isMaskedView && privacyData) ? unmaskText(selectedRisk.suggestedText) : selectedRisk.suggestedText} /></div>
                    </div>
                    <div className="p-4 border-t bg-white flex gap-3"><button onClick={() => handleAcceptRisk(selectedRisk)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">采纳修改</button><button onClick={() => handleIgnoreRisk(selectedRisk.id)} className="px-6 bg-white border border-gray-300 py-3 rounded-xl font-bold">忽略</button></div>
                </>
            )}
        </div>
      )}
    </div>
  );
};

const DiffViewer: React.FC<{ oldValue: string, newValue: string }> = ({ oldValue, newValue }) => {
    const diff = useMemo(() => {
        try {
            // @ts-ignore
            const fn = Diff.diffWords || Diff.default?.diffWords;
            return fn ? fn(oldValue, newValue) : [{ value: newValue, added: true }];
        } catch (e) {
            return [{ value: newValue, added: true }];
        }
    }, [oldValue, newValue]);
    return (<div className="font-mono text-sm break-words whitespace-pre-wrap">{diff.map((part: any, idx: number) => (<span key={idx} className={part.added ? 'bg-green-100 text-green-800' : part.removed ? 'bg-red-50 text-red-400 line-through' : 'text-gray-600'}>{part.value}</span>))}</div>);
}