
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ContractData, ContractStance, ReviewStrictness, RiskPoint, RiskLevel, ContractSummary, ReviewSession, PrivacySessionData, MaskingMap } from '../types';
import { analyzeContractRisks, generateContractSummary } from '../services/geminiService';
import { Check, X, ArrowRight, Download, Loader2, Sparkles, Wand2, ChevronLeft, ChevronRight, AlertTriangle, Shield, PieChart, Eye, EyeOff, Lock } from 'lucide-react';
import * as Diff from 'diff';

interface ReviewInterfaceProps {
  contract: ContractData;
  initialSession?: ReviewSession | null;
  privacyData?: PrivacySessionData | null;
  onSaveSession: (session: ReviewSession) => void;
  onBack: () => void;
}

export const ReviewInterface: React.FC<ReviewInterfaceProps> = ({ contract, initialSession, privacyData, onSaveSession, onBack }) => {
  // Use masked content if available, otherwise original
  const [currentText, setCurrentText] = useState(privacyData?.maskedContent || contract.content);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [risks, setRisks] = useState<RiskPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  
  // Privacy State
  const [isMaskedView, setIsMaskedView] = useState(!!privacyData);
  const maskMap = useMemo(() => privacyData?.maskMap || {}, [privacyData]);

  // Settings
  const [stance, setStance] = useState<ContractStance>(ContractStance.NEUTRAL);
  const [strictness, setStrictness] = useState<ReviewStrictness>(ReviewStrictness.BALANCED);
  
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);

  // Refs for scrolling
  const docContainerRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<{[key: string]: HTMLSpanElement | null}>({});

  // Initialize from props
  useEffect(() => {
    // If we have a previous session, restore it
    if (initialSession) {
        // If the session had privacy data, use the masked text from it
        const sessionText = initialSession.privacyData?.maskedContent || initialSession.contract.content;
        setCurrentText(sessionText);
        setRisks(initialSession.risks);
        setSummary(initialSession.summary);
        if (initialSession.privacyData) {
            setIsMaskedView(true);
        }
    } else {
        // New Session
        setCurrentText(privacyData?.maskedContent || contract.content);
        setRisks([]);
        setSummary(null);
        setSelectedRiskId(null);
        
        const fetchSummary = async () => {
          // Summary is generated on the potentially masked text to simulate privacy
          const sum = await generateContractSummary(privacyData?.maskedContent || contract.content);
          setSummary(sum);
        };
        fetchSummary();
    }
  }, [contract, initialSession, privacyData]);

  // Helper to unmask text
  const unmaskText = (text: string): string => {
      if (!text) return '';
      let result = text;
      // Sort keys by length desc to avoid partial replacement issues
      const placeholders = Object.keys(maskMap).sort((a, b) => b.length - a.length);
      for (const placeholder of placeholders) {
          // Global replacement
          result = result.split(placeholder).join(maskMap[placeholder]);
      }
      return result;
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setLoadingStep('正在分析合同条款...');
    const rulesContext = "Standard commercial contract rules, focus on liability caps and payment terms."; 
    
    try {
      // Analyze the CURRENT text (which is masked if privacy mode is on)
      const identifiedRisks = await analyzeContractRisks(currentText, stance, strictness, rulesContext);
      setRisks(identifiedRisks);
      setLoadingStep('');
      
      // Auto Save
      onSaveSession({
          id: Date.now().toString(),
          contract: { ...contract, content: currentText }, // Saving the working copy
          summary,
          risks: identifiedRisks,
          timestamp: Date.now(),
          privacyData: privacyData || undefined
      });

    } catch (e) {
      console.error(e);
      alert("分析失败，请重试");
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

  const advanceToNextRisk = (currentId: string, currentRisks: RiskPoint[]) => {
      const activeRisks = currentRisks.filter(r => !r.isAddressed);
      if (activeRisks.length === 0) {
          setSelectedRiskId(null);
          return;
      }

      // Find where the just-addressed risk was in the full list
      const currentIndexInFull = currentRisks.findIndex(r => r.id === currentId);
      
      // Try to find the next active risk appearing AFTER this position in the original document order
      let nextRisk = currentRisks.find((r, i) => !r.isAddressed && i > currentIndexInFull);
      
      // If none after, wrap to the first active risk available (beginning of doc)
      if (!nextRisk) {
          nextRisk = activeRisks[0];
      }
      
      if (nextRisk) {
          handleSelectRisk(nextRisk.id);
      }
  };

  const handleAcceptRisk = (risk: RiskPoint) => {
    // 1. Update text
    const newText = currentText.replace(risk.originalText, risk.suggestedText);
    setCurrentText(newText);
    
    // 2. Update Risk State
    const updatedRisks = risks.map(r => r.id === risk.id ? { ...r, isAddressed: true } : r);
    setRisks(updatedRisks);
    
    // 3. Auto-advance to next risk
    advanceToNextRisk(risk.id, updatedRisks);
  };

  const handleIgnoreRisk = (riskId: string) => {
    const updatedRisks = risks.map(r => r.id === riskId ? { ...r, isAddressed: true } : r);
    setRisks(updatedRisks);
    advanceToNextRisk(riskId, updatedRisks);
  };

  const navigateRisk = (direction: 'next' | 'prev') => {
      const activeRisks = risks.filter(r => !r.isAddressed);
      if (activeRisks.length === 0) return;

      let currentIndex = activeRisks.findIndex(r => r.id === selectedRiskId);
      
      // If current selection is not in active set (e.g. just resolved), treat as starting from -1
      // so Next (+1) goes to 0 (first active), Prev (-1-1=-2) wraps to end.
      if (currentIndex === -1) {
          currentIndex = -1;
      }

      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (nextIndex >= activeRisks.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = activeRisks.length - 1;

      handleSelectRisk(activeRisks[nextIndex].id);
  };

  const downloadContract = () => {
    // Always unmask before download
    const finalContent = unmaskText(currentText);
    const element = document.createElement("a");
    const file = new Blob([finalContent], {type: 'application/msword'});
    element.href = URL.createObjectURL(file);
    element.download = `Reviewed_${contract.fileName}.doc`;
    document.body.appendChild(element);
    element.click();
  };

  const renderDocumentContent = () => {
    // Current text is masked if we started with privacyData.
    // We split based on the risk.originalText (which matches the masked text).
    let parts: { text: string; riskId?: string; level?: RiskLevel }[] = [{ text: currentText }];
    const activeRisks = risks.filter(r => !r.isAddressed);
    
    activeRisks.forEach(risk => {
      const newParts: typeof parts = [];
      parts.forEach(part => {
        if (part.riskId) {
          newParts.push(part);
          return;
        }
        const split = part.text.split(risk.originalText);
        if (split.length > 1) {
          for (let i = 0; i < split.length; i++) {
            newParts.push({ text: split[i] });
            if (i < split.length - 1) {
              newParts.push({ text: risk.originalText, riskId: risk.id, level: risk.level });
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
           // If user wants "Original View", we visually unmask the content segment
           const displayText = (!isMaskedView && privacyData) ? unmaskText(part.text) : part.text;
           
           return part.riskId ? (
            <span 
              key={idx} 
              id={`highlight-${part.riskId}`}
              ref={el => highlightRefs.current[part.riskId!] = el}
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
          ) : (
            <span key={idx}>{displayText}</span>
          )
        })}
      </div>
    );
  };

  const selectedRisk = risks.find(r => r.id === selectedRiskId);
  // We calculate active risks for the drawer counter
  const activeRisks = risks.filter(r => !r.isAddressed);
  const activeCount = activeRisks.length;
  // If selected risk is addressed, indexOf returns -1. We display '-' instead of 0 for clarity.
  const currentIndexDisplay = selectedRisk && !selectedRisk.isAddressed 
      ? activeRisks.findIndex(r => r.id === selectedRisk.id) + 1 
      : '-';

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
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
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {summary ? (
                <>
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{summary.type}</span>
                  <span>|</span>
                  <span>{summary.amount}</span>
                </>
              ) : (
                <span>Loading summary...</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {privacyData && (
            <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
                <button 
                    onClick={() => setIsMaskedView(true)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${isMaskedView ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <EyeOff className="w-3.5 h-3.5" /> 脱敏模式
                </button>
                <button 
                    onClick={() => setIsMaskedView(false)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${!isMaskedView ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Eye className="w-3.5 h-3.5" /> 原文模式
                </button>
            </div>
          )}
          <button 
            onClick={downloadContract}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            {privacyData ? '复敏下载' : '下载合同'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Document View */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 relative scroll-smooth" ref={docContainerRef}>
          <div className="max-w-4xl mx-auto bg-white min-h-[1000px] shadow-lg p-12 rounded-sm border border-gray-200">
             {renderDocumentContent()}
          </div>
        </div>

        {/* Right: Layout Column (Placeholder/Static Dashboard) */}
        {/* This column stays in flow to preserve the document width */}
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
                    配置您的审查立场，AI 将基于内置的法律知识库为您排查风险。
                  </p>
                  {privacyData && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                          <Lock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 leading-relaxed">
                              当前处于隐私保护模式。AI 将仅能看到脱敏后的文本 (如 [PARTY_A])，不会接触您的真实敏感数据。
                          </p>
                      </div>
                  )}
                </div>

                <div className="space-y-5 bg-slate-50 p-6 rounded-xl border border-slate-100">
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

          {/* 2. Dashboard Overview (Default when analyzed) */}
          {risks.length > 0 && (
            <div className="flex flex-col h-full bg-slate-50/50">
                <div className="p-6 border-b bg-white">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-blue-500" />
                        审查概览
                    </h3>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-3xl font-bold text-gray-800 mb-1">{risks.length}</div>
                            <div className="text-xs text-gray-500 uppercase font-medium">风险总数</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-3xl font-bold text-green-600 mb-1">{risks.filter(r => r.isAddressed).length}</div>
                            <div className="text-xs text-gray-500 uppercase font-medium">已处理</div>
                        </div>
                    </div>

                    {/* Risk Breakdown */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                            <span className="text-xs font-bold text-gray-500 uppercase">风险分布</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-200"></div>
                                    <span className="text-sm font-medium text-gray-700">高风险 (High)</span>
                                </div>
                                <span className="text-sm font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                    {risks.filter(r => r.level === RiskLevel.HIGH && !r.isAddressed).length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm shadow-orange-200"></div>
                                    <span className="text-sm font-medium text-gray-700">中风险 (Medium)</span>
                                </div>
                                <span className="text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                                    {risks.filter(r => r.level === RiskLevel.MEDIUM && !r.isAddressed).length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-sm shadow-yellow-200"></div>
                                    <span className="text-sm font-medium text-gray-700">低风险 (Low)</span>
                                </div>
                                <span className="text-sm font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                                    {risks.filter(r => r.level === RiskLevel.LOW && !r.isAddressed).length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Instructions */}
                    {activeCount > 0 ? (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex gap-4 items-start">
                            <AlertTriangle className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-bold text-blue-800 mb-1">待处理事项</h4>
                                <p className="text-sm text-blue-600 leading-relaxed">
                                    左侧文档中标记了 <strong>{activeCount}</strong> 处风险点。
                                    <br/>
                                    <span className="font-semibold underline">点击文档中的高亮文本</span> 即可在此处查看详情并进行修改。
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <Shield className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="font-bold text-gray-800">审查完成</h3>
                            <p className="text-gray-500 text-sm mt-1">合同风险已全部处理完毕。</p>
                        </div>
                    )}

                     {/* Reset Button */}
                     <div className="pt-4 border-t border-gray-200">
                        <button 
                            onClick={() => { setRisks([]); setSummary(null); }}
                            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            重新开始新的审查
                        </button>
                     </div>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Risk Detail Drawer (Fixed Overlay) */}
      {selectedRisk && (
        <div className="fixed top-0 right-0 bottom-0 w-[450px] bg-white shadow-[0_0_50px_-12px_rgba(0,0,0,0.25)] border-l border-gray-200 z-[60] flex flex-col animate-in slide-in-from-right duration-300">
            {/* Detail Header */}
            <div className="p-4 pt-6 border-b flex items-center justify-between bg-slate-50">
                <button onClick={() => setSelectedRiskId(null)} className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-medium">
                    <ChevronLeft className="w-4 h-4" /> 返回概览
                </button>
                <div className="flex items-center gap-1">
                    <button onClick={() => navigateRisk('prev')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Previous Risk">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xs text-gray-400 font-mono">
                        {currentIndexDisplay} / {activeCount}
                    </span>
                    <button onClick={() => navigateRisk('next')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Next Risk">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                    <button onClick={() => setSelectedRiskId(null)} className="ml-2 p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-gray-400" title="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center gap-2 mb-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                        selectedRisk.level === RiskLevel.HIGH ? 'bg-red-100 text-red-700' :
                        selectedRisk.level === RiskLevel.MEDIUM ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                        {selectedRisk.level} Risk
                    </span>
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 mb-3">{selectedRisk.riskDescription}</h3>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-6 text-gray-600 leading-relaxed text-sm">
                    {selectedRisk.reason}
                </div>

                <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">建议修改 (Diff)</span>
                    <div className="h-px bg-gray-100 flex-1"></div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-8 shadow-inner">
                    <DiffViewer 
                        oldValue={(!isMaskedView && privacyData) ? unmaskText(selectedRisk.originalText) : selectedRisk.originalText} 
                        newValue={(!isMaskedView && privacyData) ? unmaskText(selectedRisk.suggestedText) : selectedRisk.suggestedText} 
                    />
                </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="p-4 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <div className="flex gap-3">
                    <button 
                        onClick={() => handleAcceptRisk(selectedRisk)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
                    >
                        <Check className="w-5 h-5" /> 采纳修改
                    </button>
                    <button 
                        onClick={() => handleIgnoreRisk(selectedRisk.id)}
                        className="px-6 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                        忽略
                    </button>
                </div>
            </div>
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
            if (fn) return fn(oldValue, newValue);
            return [{ value: newValue, added: true, removed: false }];
        } catch (e) {
            return [{ value: newValue, added: true, removed: false }];
        }
    }, [oldValue, newValue]);

    return (
        <div className="font-mono text-sm leading-relaxed break-words whitespace-pre-wrap">
            {diff.map((part: any, index: number) => {
                const color = part.added ? 'bg-green-100 text-green-800 decoration-green-500 underline decoration-2' :
                              part.removed ? 'bg-red-50 text-red-400 line-through decoration-red-300' :
                              'text-gray-600';
                return (
                    <span key={index} className={color}>
                        {part.value}
                    </span>
                )
            })}
        </div>
    );
}
