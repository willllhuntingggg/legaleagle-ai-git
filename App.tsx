
import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, Settings, ShieldCheck, PenTool, Layout, Loader2, History, Clock, FileWarning, ArrowRight, BookOpen } from 'lucide-react';
import { ReviewInterface } from './components/ReviewInterface';
import { KnowledgeBase } from './components/KnowledgeBase';
import { ContractDrafting } from './components/ContractDrafting';
import { PrivacyGuard } from './components/PrivacyGuard';
import { ContractData, ReviewSession, PrivacySessionData, MaskingMap, KnowledgeRule, RiskLevel } from './types';

const DEMO_CONTRACT_TEXT = `CONTRACT FOR SERVICES

THIS AGREEMENT is made this 10th day of October, 2023, by and between TechCorp Inc. ("Client") and DevSolutions LLC ("Provider").

1. SERVICES. Provider agrees to perform the following services: Software Development.

2. PAYMENT. Client agrees to pay Provider a total of $50,000. Payment terms are Net 90 days from the date of invoice.

3. LIABILITY. Provider's total liability under this Agreement shall be limited to $5,000, regardless of the cause of action.

4. TERMINATION. Client may terminate this agreement at any time. Provider may not terminate this agreement before completion of services.

5. CONFIDENTIALITY. Provider shall keep all information confidential for a period of 1 year.

IN WITNESS WHEREOF, the parties have executed this Agreement.`;

const DEFAULT_RULES: KnowledgeRule[] = [
  { id: '1', category: '通用', name: '责任限额', description: '总赔偿责任不应超过合同总价的 100%。', riskLevel: RiskLevel.HIGH },
  { id: '2', category: '支付', name: '付款账期', description: '付款期限不应超过 60 天。', riskLevel: RiskLevel.MEDIUM },
  { id: '3', category: '终止', name: '单方解除权', description: '双方均应拥有合理的提前通知终止权。', riskLevel: RiskLevel.MEDIUM },
];

enum Page {
  DASHBOARD = 'DASHBOARD',
  PRIVACY_GUARD = 'PRIVACY_GUARD',
  REVIEW = 'REVIEW',
  DRAFT = 'DRAFT',
  KNOWLEDGE = 'KNOWLEDGE',
  HISTORY = 'HISTORY'
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.DASHBOARD);
  const [activeContract, setActiveContract] = useState<ContractData | null>(null);
  const [historySession, setHistorySession] = useState<ReviewSession | null>(null);
  const [privacyData, setPrivacyData] = useState<PrivacySessionData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [knowledgeRules, setKnowledgeRules] = useState<KnowledgeRule[]>([]);
  
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showUploadGuide, setShowUploadGuide] = useState(false);

  useEffect(() => {
    try {
        const savedSessions = localStorage.getItem('legalEagle_history');
        if (savedSessions) setSessions(JSON.parse(savedSessions));

        const savedRules = localStorage.getItem('legalEagle_rules');
        if (savedRules) {
            setKnowledgeRules(JSON.parse(savedRules));
        } else {
            setKnowledgeRules(DEFAULT_RULES);
        }
    } catch (e) {
        console.error("Failed to load local data", e);
    }
  }, []);

  const saveSession = (session: ReviewSession) => {
      const updated = [session, ...sessions.filter(s => s.id !== session.id)].slice(0, 20);
      setSessions(updated);
      localStorage.setItem('legalEagle_history', JSON.stringify(updated));
  };

  const updateKnowledgeRules = (newRules: KnowledgeRule[]) => {
      setKnowledgeRules(newRules);
      localStorage.setItem('legalEagle_rules', JSON.stringify(newRules));
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const file = e.target.files[0];
        const isWord = file.name.endsWith('.docx') || file.name.endsWith('.doc');
        if (isWord) {
            setPendingFile(file);
            setShowUploadGuide(true);
        } else {
            processFile(file);
        }
        e.target.value = ''; 
    }
  };

  const confirmUpload = () => {
    if (pendingFile) {
        setShowUploadGuide(false);
        processFile(pendingFile);
        setPendingFile(null);
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setShowUploadGuide(false);
  };

  const processFile = (file: File) => {
      setIsProcessing(true);
      const reader = new FileReader();
      
      const processContent = (content: string) => {
        if (!content || content.trim().length === 0) {
            alert("解析内容为空");
            setIsProcessing(false);
            return;
        }
        setActiveContract({ fileName: file.name, content: content, lastModified: file.lastModified });
        setHistorySession(null); 
        setPrivacyData(null); 
        setCurrentPage(Page.PRIVACY_GUARD); 
        setIsProcessing(false);
      };

      if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        reader.onload = async (event) => {
          try {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            let mammoth = (window as any).mammoth;
            if (mammoth?.extractRawText) {
                const result = await mammoth.extractRawText({ arrayBuffer });
                processContent(result.value);
            } else {
                alert("Mammoth 加载失败");
                setIsProcessing(false);
            }
          } catch (error) {
            processContent(DEMO_CONTRACT_TEXT);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = (event) => processContent(event.target?.result as string);
        reader.readAsText(file);
      }
  };

  const useDemoContract = () => {
    setActiveContract({ fileName: 'Service_Agreement_Demo.docx', content: DEMO_CONTRACT_TEXT, lastModified: Date.now() });
    setHistorySession(null);
    setPrivacyData(null);
    setCurrentPage(Page.PRIVACY_GUARD);
  };

  const loadHistory = (session: ReviewSession) => {
      setActiveContract(session.contract);
      setHistorySession(session);
      setPrivacyData(session.privacyData || null);
      setCurrentPage(Page.REVIEW);
  };

  const renderContent = () => {
    if (currentPage === Page.PRIVACY_GUARD && activeContract) {
        return (
            <PrivacyGuard 
                originalContent={activeContract.content}
                onComplete={(masked, map) => {
                    setPrivacyData({ originalContent: activeContract.content, maskedContent: masked, maskMap: map, isMasked: true });
                    setCurrentPage(Page.REVIEW);
                }}
                onSkip={() => { setPrivacyData(null); setCurrentPage(Page.REVIEW); }}
            />
        );
    }

    if (currentPage === Page.REVIEW && activeContract) {
      return (
        <ReviewInterface 
            contract={activeContract} 
            initialSession={historySession}
            privacyData={privacyData}
            knowledgeRules={knowledgeRules}
            onSaveSession={saveSession}
            onBack={() => historySession ? setCurrentPage(Page.HISTORY) : setCurrentPage(Page.PRIVACY_GUARD)} 
        />
      );
    }
    
    switch (currentPage) {
      case Page.KNOWLEDGE:
        return <KnowledgeBase rules={knowledgeRules} onUpdateRules={updateKnowledgeRules} />;
      case Page.DRAFT:
        return <ContractDrafting />;
      case Page.HISTORY:
        return (
            <div className="p-8 max-w-5xl mx-auto w-full">
                <div className="mb-8"><h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><History className="w-6 h-6 text-blue-600" />审查历史</h2></div>
                <div className="grid gap-4">
                    {sessions.length === 0 ? <div className="text-center py-12 text-gray-400">暂无记录</div> : 
                        sessions.map(s => (
                            <div key={s.id} onClick={() => loadHistory(s)} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-blue-400 cursor-pointer flex justify-between items-center group">
                                <div><h3 className="font-bold text-gray-800 text-lg group-hover:text-blue-600">{s.contract.fileName}</h3><div className="flex gap-4 mt-2 text-sm text-gray-500"><span>{new Date(s.timestamp).toLocaleString()}</span><span className="text-red-500">{s.risks.filter(r => r.level === 'HIGH').length} 高危</span></div></div>
                                <Layout className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
                            </div>
                        ))
                    }
                </div>
            </div>
        );
      case Page.DASHBOARD:
      default:
        return (
          <div className="p-8 max-w-6xl mx-auto w-full">
            <div className="mb-12 text-center">
                <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">AI 智能合同审查平台</h1>
                <p className="text-lg text-slate-500">上传合同，立即获取基于自定义知识库的风险评估与修改建议。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
               <div className="bg-white rounded-2xl p-8 shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center group hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={onFileSelect} accept=".txt,.md,.doc,.docx,.pdf" disabled={isProcessing} />
                  <div className="bg-blue-100 p-4 rounded-full mb-6">{isProcessing ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" /> : <UploadCloud className="w-8 h-8 text-blue-600" />}</div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">上传合同审查</h3>
                  <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium mt-4">选择文件</button>
               </div>
               <div onClick={useDemoContract} className="bg-white rounded-2xl p-8 shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center group hover:border-purple-400 transition-all cursor-pointer">
                   <div className="bg-purple-100 p-4 rounded-full mb-6"><ShieldCheck className="w-8 h-8 text-purple-600" /></div>
                   <h3 className="text-xl font-bold text-slate-800 mb-2">使用演示合同</h3>
                   <button className="text-purple-600 font-medium mt-4">立即尝试 &rarr;</button>
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => setCurrentPage(Page.DRAFT)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all"><PenTool className="w-6 h-6 text-slate-700 mb-4" /><h4 className="font-semibold text-lg mb-1">智能起草</h4></div>
                <div onClick={() => setCurrentPage(Page.KNOWLEDGE)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all"><BookOpen className="w-6 h-6 text-slate-700 mb-4" /><h4 className="font-semibold text-lg mb-1">知识库管理</h4></div>
                <div onClick={() => setCurrentPage(Page.HISTORY)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all"><History className="w-6 h-6 text-slate-700 mb-4" /><h4 className="font-semibold text-lg mb-1">审查历史</h4></div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen bg-slate-50 text-slate-900 font-sans flex overflow-hidden">
      {showUploadGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4"><FileWarning className="w-6 h-6 text-yellow-600" /></div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">上传确认</h3>
                  <p className="text-sm text-gray-600 mb-6">解析 Word 可能丢失排版，建议仅用于内容审查。</p>
                  <div className="flex gap-3 justify-end"><button onClick={cancelUpload} className="px-4 py-2 text-gray-600">取消</button><button onClick={confirmUpload} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold">确认</button></div>
              </div>
          </div>
      )}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-slate-800 text-white font-bold text-xl flex items-center gap-2"><div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">L</div>LegalEagle</div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => { setActiveContract(null); setCurrentPage(Page.DASHBOARD); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${currentPage === Page.DASHBOARD ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Layout className="w-5 h-5" />工作台</button>
          <button onClick={() => setCurrentPage(Page.DRAFT)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${currentPage === Page.DRAFT ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><PenTool className="w-5 h-5" />合同起草</button>
          <button onClick={() => setCurrentPage(Page.KNOWLEDGE)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${currentPage === Page.KNOWLEDGE ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><BookOpen className="w-5 h-5" />知识库</button>
          <button onClick={() => setCurrentPage(Page.HISTORY)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${currentPage === Page.HISTORY ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><History className="w-5 h-5" />审查历史</button>
        </nav>
        <div className="p-6 border-t border-slate-800 text-xs text-slate-500">v1.1.0 · Powered by Gemini 3</div>
      </aside>
      <main className={`flex-1 flex flex-col overflow-hidden`}>{renderContent()}</main>
    </div>
  );
};

export default App;
