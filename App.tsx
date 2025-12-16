
import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, Settings, ShieldCheck, PenTool, Layout, Loader2, History, Clock, FileWarning, ArrowRight } from 'lucide-react';
import { ReviewInterface } from './components/ReviewInterface';
import { KnowledgeBase } from './components/KnowledgeBase';
import { ContractDrafting } from './components/ContractDrafting';
import { PrivacyGuard } from './components/PrivacyGuard';
import { ContractData, ReviewSession, PrivacySessionData, MaskingMap } from './types';

// Mock text for demo purposes
const DEMO_CONTRACT_TEXT = `CONTRACT FOR SERVICES

THIS AGREEMENT is made this 10th day of October, 2023, by and between TechCorp Inc. ("Client") and DevSolutions LLC ("Provider").

1. SERVICES. Provider agrees to perform the following services: Software Development.

2. PAYMENT. Client agrees to pay Provider a total of $50,000. Payment terms are Net 90 days from the date of invoice.

3. LIABILITY. Provider's total liability under this Agreement shall be limited to $5,000, regardless of the cause of action.

4. TERMINATION. Client may terminate this agreement at any time. Provider may not terminate this agreement before completion of services.

5. CONFIDENTIALITY. Provider shall keep all information confidential for a period of 1 year.

IN WITNESS WHEREOF, the parties have executed this Agreement.`;

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
  
  // Upload Flow State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showUploadGuide, setShowUploadGuide] = useState(false);

  // Load history on mount
  useEffect(() => {
    try {
        const saved = localStorage.getItem('legalEagle_history');
        if (saved) {
            setSessions(JSON.parse(saved));
        }
    } catch (e) {
        console.error("Failed to load history", e);
    }
  }, []);

  const saveSession = (session: ReviewSession) => {
      const updated = [session, ...sessions.filter(s => s.id !== session.id)].slice(0, 20); // Limit to 20
      setSessions(updated);
      localStorage.setItem('legalEagle_history', JSON.stringify(updated));
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const file = e.target.files[0];
        
        // Only show guide for Word documents
        const isWord = file.name.endsWith('.docx') || file.name.endsWith('.doc');
        
        if (isWord) {
            setPendingFile(file);
            setShowUploadGuide(true);
        } else {
            // Directly process other formats
            processFile(file);
        }
        
        // Clear input value so same file can be selected again if needed
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
            alert("解析的内容为空，可能是由于文件格式特殊或不包含文本。");
            setIsProcessing(false);
            return;
        }
        setActiveContract({
          fileName: file.name,
          content: content,
          lastModified: file.lastModified
        });
        setHistorySession(null); // Clear history session mode
        setPrivacyData(null); // Clear previous privacy data
        setCurrentPage(Page.PRIVACY_GUARD); // Go to Privacy Guard first
        setIsProcessing(false);
      };

      if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        reader.onload = async (event) => {
          try {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            
            // Check for mammoth library
            let mammoth = (window as any).mammoth;
            if (!mammoth) {
                await new Promise(resolve => setTimeout(resolve, 500));
                mammoth = (window as any).mammoth;
            }

            if (mammoth && mammoth.extractRawText) {
                const result = await mammoth.extractRawText({ arrayBuffer });
                processContent(result.value);
            } else {
                console.error("Mammoth library not loaded");
                alert("组件加载中，请稍后重试或刷新页面。");
                setIsProcessing(false);
            }
          } catch (error) {
            console.error("DOCX parsing failed", error);
            alert("Word 文件解析失败，将加载演示文本以供测试。");
            processContent(DEMO_CONTRACT_TEXT);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        reader.onload = (event) => {
          processContent(event.target?.result as string);
        };
        reader.readAsText(file);
      } else {
         // Default to text processing for unknown types, or PDF placeholder
         setTimeout(() => {
             // For PDF or others not explicitly handled in frontend demo
             if (file.type.includes('pdf')) {
                alert("PDF 解析暂不支持纯前端模式，已加载演示文本用于体验。");
                processContent(DEMO_CONTRACT_TEXT);
             } else {
                 // Try reading as text fallback
                 const textReader = new FileReader();
                 textReader.onload = (e) => processContent(e.target?.result as string);
                 textReader.readAsText(file);
             }
         }, 500);
      }
  };

  const useDemoContract = () => {
    setActiveContract({
      fileName: 'Service_Agreement_Draft_v1.docx',
      content: DEMO_CONTRACT_TEXT,
      lastModified: Date.now()
    });
    setHistorySession(null);
    setPrivacyData(null);
    setCurrentPage(Page.PRIVACY_GUARD);
  };

  const loadHistory = (session: ReviewSession) => {
      setActiveContract(session.contract);
      setHistorySession(session);
      // If history session has privacy data, we use it
      setPrivacyData(session.privacyData || null);
      setCurrentPage(Page.REVIEW);
  };

  const handlePrivacyComplete = (maskedContent: string, map: MaskingMap) => {
      if (activeContract) {
          setPrivacyData({
              originalContent: activeContract.content,
              maskedContent: maskedContent,
              maskMap: map,
              isMasked: true
          });
          setCurrentPage(Page.REVIEW);
      }
  };

  const renderContent = () => {
    if (currentPage === Page.PRIVACY_GUARD && activeContract) {
        return (
            <PrivacyGuard 
                originalContent={activeContract.content}
                onComplete={handlePrivacyComplete}
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
            onSaveSession={saveSession}
            onBack={() => { setActiveContract(null); setCurrentPage(Page.DASHBOARD); }} 
        />
      );
    }
    
    if (currentPage === Page.HISTORY) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <History className="w-6 h-6 text-blue-600" />
                        历史档案
                    </h2>
                    <p className="text-gray-500 mt-1">查看之前的合同审查记录。</p>
                </div>
                <div className="grid gap-4">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed">
                            <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>暂无历史记录</p>
                        </div>
                    ) : (
                        sessions.map(s => (
                            <div key={s.id} onClick={() => loadHistory(s)} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex justify-between items-center group">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors">{s.contract.fileName}</h3>
                                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(s.timestamp).toLocaleString()}</span>
                                        <span>{s.summary?.type || '未知类型'}</span>
                                        <span className="text-red-500">{s.risks.filter(r => r.level === 'HIGH').length} 高危</span>
                                        {s.privacyData && (
                                            <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 rounded-full text-xs">
                                                <ShieldCheck className="w-3 h-3" /> 脱敏审查
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Layout className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }
    
    switch (currentPage) {
      case Page.KNOWLEDGE:
        return <KnowledgeBase />;
      case Page.DRAFT:
        return <ContractDrafting />;
      case Page.DASHBOARD:
      default:
        return (
          <div className="p-8 max-w-6xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                AI 智能合同审查平台
              </h1>
              <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                上传合同，立即获取风险评估、修改建议与合规性检查。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
               {/* Upload Card */}
               <div className="bg-white rounded-2xl p-8 shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center group hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden">
                  <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                    onChange={onFileSelect}
                    accept=".txt,.md,.doc,.docx,.pdf"
                    disabled={isProcessing}
                  />
                  <div className="bg-blue-100 p-4 rounded-full mb-6 z-0">
                    {isProcessing ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" /> : <UploadCloud className="w-8 h-8 text-blue-600" />}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2 z-0">{isProcessing ? '正在解析...' : '上传合同审查'}</h3>
                  <p className="text-slate-500 mb-6 z-0">支持 .txt, .md, .pdf, .docx <span className="text-xs text-orange-500">(Word排版可能不完整)</span></p>
                  <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium hover:bg-blue-700 transition-colors z-0">
                    选择文件
                  </button>
               </div>

               {/* Demo Card */}
               <div onClick={useDemoContract} className="bg-white rounded-2xl p-8 shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center group hover:border-purple-400 transition-all cursor-pointer relative">
                   <div className="bg-purple-100 p-4 rounded-full mb-6">
                    <ShieldCheck className="w-8 h-8 text-purple-600" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-800 mb-2">使用演示合同</h3>
                   <p className="text-slate-500 mb-6">快速体验 AI 审查流程</p>
                   <button className="text-purple-600 font-medium hover:text-purple-800 z-0">
                    立即尝试 &rarr;
                   </button>
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => setCurrentPage(Page.DRAFT)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all">
                    <PenTool className="w-6 h-6 text-slate-700 mb-4" />
                    <h4 className="font-semibold text-lg mb-1">智能起草</h4>
                    <p className="text-sm text-gray-500">输入需求，一键生成标准合同文本。</p>
                </div>
                <div onClick={() => setCurrentPage(Page.KNOWLEDGE)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all">
                    <Settings className="w-6 h-6 text-slate-700 mb-4" />
                    <h4 className="font-semibold text-lg mb-1">知识库管理</h4>
                    <p className="text-sm text-gray-500">自定义审查规则与风险偏好。</p>
                </div>
                 <div onClick={() => setCurrentPage(Page.HISTORY)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition-all">
                    <History className="w-6 h-6 text-slate-700 mb-4" />
                    <h4 className="font-semibold text-lg mb-1">历史档案</h4>
                    <p className="text-sm text-gray-500">查看已审查合同的历史记录。</p>
                </div>
            </div>
          </div>
        );
    }
  };

  // Determine if the current page handles its own scrolling (Application-like view)
  const isAppView = currentPage === Page.PRIVACY_GUARD || currentPage === Page.REVIEW;

  return (
    // Changed: h-screen and overflow-hidden to create a fixed viewport application shell
    <div className="h-screen bg-slate-50 text-slate-900 font-sans flex overflow-hidden">
      {/* Upload Guide Modal */}
      {showUploadGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6">
                      <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                          <FileWarning className="w-6 h-6 text-yellow-600" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">上传前请确认</h3>
                      <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                          <p>
                              您正在上传合同文件。LegalEagle AI 专注于<strong>法律风险审查与内容分析</strong>。
                          </p>
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                              <p className="font-semibold text-slate-800 mb-2">⚠️ 排版格式提示</p>
                              <p>由于浏览器安全限制，文件解析过程可能会<strong>丢失原始 Word 排版格式</strong> (如页眉、页脚、复杂表格)。</p>
                          </div>
                          <p>
                              建议您：
                              <br/>
                              1. 在此平台完成<strong>内容审查与风险确认</strong>
                              <br/>
                              2. 确认无误后，再在本地 Word 中调整最终排版
                          </p>
                      </div>
                  </div>
                  <div className="p-4 bg-gray-50 flex gap-3 justify-end border-t border-gray-100">
                      <button 
                          onClick={cancelUpload}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                      >
                          取消上传
                      </button>
                      <button 
                          onClick={confirmUpload}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-200"
                      >
                          确认上传 <ArrowRight className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Sidebar - Changed to h-full and overflow-y-auto since parent is fixed */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full overflow-y-auto shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-xl">
             <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">L</div>
             LegalEagle
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { setActiveContract(null); setCurrentPage(Page.DASHBOARD); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentPage === Page.DASHBOARD ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Layout className="w-5 h-5" />
            工作台
          </button>
          
          <button 
             onClick={() => setCurrentPage(Page.DRAFT)}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentPage === Page.DRAFT ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <PenTool className="w-5 h-5" />
            合同起草
          </button>

          <button 
             onClick={() => setCurrentPage(Page.KNOWLEDGE)}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentPage === Page.KNOWLEDGE ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Settings className="w-5 h-5" />
            知识库
          </button>

          <button 
             onClick={() => setCurrentPage(Page.HISTORY)}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentPage === Page.HISTORY ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <History className="w-5 h-5" />
            历史档案
          </button>
        </nav>

        <div className="p-6 border-t border-slate-800 text-xs text-slate-500">
          v1.0.0 Alpha <br/>
          Powered by Gemini 2.5
        </div>
      </aside>

      {/* Main Content - Conditionally apply overflow logic */}
      <main className={`flex-1 flex flex-col ${isAppView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
