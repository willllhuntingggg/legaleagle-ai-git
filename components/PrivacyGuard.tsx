import React, { useState, useMemo, useRef } from 'react';
import { Shield, Lock, Trash2, ArrowRight, Wand2, Highlighter, CreditCard, MapPin, Phone, Ban, Building2, User, Users, UserCircle, Briefcase, Eye, EyeOff, Settings, Plus, X } from 'lucide-react';
import { MaskingMap, SensitiveWord } from '../types';

interface PrivacyGuardProps {
    originalContent: string;
    sensitiveWords: SensitiveWord[];
    onUpdateSensitiveWords: (words: SensitiveWord[]) => void;
    onComplete: (maskedContent: string, map: MaskingMap) => void;
    onSkip: () => void;
}

const REGEX_PATTERNS = [
    { 
        id: 'money',
        label: '金额 (Money)', 
        // Logic: (Currency Prefix + Number/Chinese + Optional Unit Suffix) OR (Number/Chinese + Required Unit Suffix)
        // This ensures amounts like ￥377,358.49 are captured even without a trailing "元"
        regex: /(人民币|RMB|CNY|¥|￥|\$|€|£)\s?(([1-9]\d{0,2}(,\d{3})*|0)(\.\d{1,2})?|[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+)(\s?(元|万元|亿元|万|亿|USD|Dollars|美金|整|角|分)){0,2}|(([1-9]\d{0,2}(,\d{3})*|0)(\.\d{1,2})?|[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+)\s?(元|万元|亿元|万|亿|USD|Dollars|美金|整|角|分){1,2}/gi,
        prefix: '[AMOUNT_' 
    },
    { 
        id: 'email',
        label: '电子邮箱 (Email)', 
        regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 
        prefix: '[EMAIL_'
    },
    { 
        id: 'date',
        label: '日期 (Date)', 
        regex: /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}([日])?)|(\d{1,2}\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{4})/gi, 
        prefix: '[DATE_' 
    },
    { 
        id: 'phone',
        label: '电话/传真 (Tel/Fax)', 
        // Added \b boundaries to prevent partial matches of longer digit strings (like bank cards)
        regex: /\b((\+?86)?\s?1[3-9]\d{9})\b|\b(\d{3,4}\s*[-]\s*\d{7,8})\b|\b(\d{15}|\d{18})\b/g, 
        prefix: '[PHONE_' 
    },
    { 
        id: 'bank',
        label: '银行卡号 (Bank Card)', 
        // Ensure bank cards are captured as full blocks
        regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,14}\b|\b\d{12,30}\b/g, 
        prefix: '[BANK_' 
    }
];

export const PrivacyGuard: React.FC<PrivacyGuardProps> = ({ originalContent, sensitiveWords, onUpdateSensitiveWords, onComplete, onSkip }) => {
    // Selection State
    const [activeRegexes, setActiveRegexes] = useState<Set<string>>(new Set(['money', 'email', 'date', 'phone', 'bank']));
    
    // UI State
    const [selection, setSelection] = useState<string>('');
    const [customPlaceholder, setCustomPlaceholder] = useState('');
    const [popupPos, setPopupPos] = useState<{top: number, left: number} | null>(null);
    const [viewMode, setViewMode] = useState<'masked' | 'original'>('masked');
    
    // Modal State
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [editingWord, setEditingWord] = useState<Partial<SensitiveWord>>({});
    
    // Custom Tooltip State
    const [hoverTooltip, setHoverTooltip] = useState<{text: string, x: number, y: number} | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // Compute Masked Content & Map
    const computedData = useMemo(() => {
        let text = originalContent;
        const map: MaskingMap = {};
        let totalCount = 0;
        
        // 1. Apply Sensitive Words (Manual Rules) First
        const sortedRules = [...sensitiveWords].sort((a, b) => b.target.length - a.target.length);
        
        sortedRules.forEach(rule => {
            if (!rule.target) return;
            let patternString = rule.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patternString = patternString.replace(/(\\\(|（)/g, '[\\(（]');
            patternString = patternString.replace(/(\\\)|）)/g, '[\\)）]');

            const regex = new RegExp(patternString, 'g');
            const matches = text.match(regex);
            if (matches) {
                totalCount += matches.length;
                map[rule.placeholder] = rule.target;
                text = text.replace(regex, rule.placeholder);
            }
        });

        // 2. Apply Regex Rules
        REGEX_PATTERNS.forEach(pattern => {
            if (activeRegexes.has(pattern.id)) {
                let counter = 1;
                text = text.replace(pattern.regex, (match) => {
                    const placeholder = `${pattern.prefix}${counter}]`;
                    map[placeholder] = match;
                    counter++;
                    totalCount++;
                    return placeholder;
                });
            }
        });

        return { text, map, totalCount };
    }, [originalContent, sensitiveWords, activeRegexes]);

    const handleTextMouseUp = () => {
        const selectionObj = window.getSelection();
        if (selectionObj && selectionObj.toString().trim().length > 0) {
            const text = selectionObj.toString().trim();
            if (text.includes('[') && text.includes(']')) {
                setSelection('');
                setPopupPos(null);
                return;
            }

            setSelection(text);
            if (!customPlaceholder) {
                setCustomPlaceholder('[PARTY_A]');
            }

            if (selectionObj.rangeCount > 0 && containerRef.current) {
                const range = selectionObj.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                setPopupPos({
                    top: rect.bottom - containerRect.top + containerRef.current.scrollTop + 10,
                    left: rect.left - containerRect.left + (rect.width / 2)
                });
            }
        } else {
            setSelection('');
            setPopupPos(null);
        }
    };

    const addManualRule = () => {
        if (selection && customPlaceholder) {
            // Check if already exists
            const existingIndex = sensitiveWords.findIndex(r => r.target === selection);
            const newRule: SensitiveWord = {
                id: existingIndex !== -1 ? sensitiveWords[existingIndex].id : Date.now().toString(),
                target: selection,
                placeholder: customPlaceholder
            };

            let newWords;
            if (existingIndex !== -1) {
                newWords = [...sensitiveWords];
                newWords[existingIndex] = newRule;
            } else {
                newWords = [...sensitiveWords, newRule];
            }
            
            onUpdateSensitiveWords(newWords);
            setSelection('');
            setCustomPlaceholder('');
            setPopupPos(null);
            window.getSelection()?.removeAllRanges();
        }
    };

    const removeRule = (id: string) => {
        onUpdateSensitiveWords(sensitiveWords.filter(r => r.id !== id));
    };

    const saveLibraryWord = () => {
        if (editingWord.target && editingWord.placeholder) {
             const newWord: SensitiveWord = {
                id: editingWord.id || Date.now().toString(),
                target: editingWord.target,
                placeholder: editingWord.placeholder
             };
             
             if (editingWord.id) {
                 onUpdateSensitiveWords(sensitiveWords.map(w => w.id === newWord.id ? newWord : w));
             } else {
                 onUpdateSensitiveWords([...sensitiveWords, newWord]);
             }
             setEditingWord({});
        }
    };

    const deleteLibraryWord = (id: string) => {
        onUpdateSensitiveWords(sensitiveWords.filter(w => w.id !== id));
    };

    const toggleRegex = (id: string) => {
        const newSet = new Set(activeRegexes);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setActiveRegexes(newSet);
    };

    const handleMouseEnterTag = (e: React.MouseEvent, tag: string) => {
        const original = computedData.map[tag];
        if (original) {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setHoverTooltip({
                text: original,
                x: rect.left + rect.width / 2,
                y: rect.top - 8
            });
        }
    };

    const handleMouseLeaveTag = () => {
        setHoverTooltip(null);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {hoverTooltip && (
                <div 
                    className="fixed z-[100] px-3 py-1.5 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full whitespace-nowrap animate-in fade-in duration-75 font-mono"
                    style={{ top: hoverTooltip.y, left: hoverTooltip.x }}
                >
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                    <span className="text-gray-400 mr-2">原文:</span>
                    <span className="font-bold">{hoverTooltip.text}</span>
                </div>
            )}

            {/* Library Modal */}
            {showLibraryModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                     <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh]">
                         <div className="p-6 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                             <div>
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-blue-600" />
                                    敏感词库管理
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">在此添加或修改需要脱敏的敏感词及其替换标签。</p>
                             </div>
                             <button onClick={() => setShowLibraryModal(false)} className="text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors">
                                 <X className="w-6 h-6" />
                             </button>
                         </div>
                         
                         <div className="p-6 bg-white border-b border-gray-100">
                             <div className="flex gap-4 items-end">
                                 <div className="flex-1">
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">原文敏感词</label>
                                     <input 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder="例如: 华为技术有限公司"
                                        value={editingWord.target || ''}
                                        onChange={e => setEditingWord({ ...editingWord, target: e.target.value })}
                                     />
                                 </div>
                                 <div className="w-48">
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">替换标签</label>
                                     <input 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                        placeholder="例如: [PARTY_A]"
                                        value={editingWord.placeholder || ''}
                                        onChange={e => setEditingWord({ ...editingWord, placeholder: e.target.value })}
                                     />
                                 </div>
                                 <button 
                                    onClick={saveLibraryWord}
                                    disabled={!editingWord.target || !editingWord.placeholder}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                 >
                                    <Plus className="w-4 h-4" />
                                    {editingWord.id ? '更新' : '添加'}
                                 </button>
                                 {editingWord.id && (
                                     <button onClick={() => setEditingWord({})} className="text-gray-500 hover:text-gray-700 px-3 py-2.5 font-medium">
                                         取消
                                     </button>
                                 )}
                             </div>
                         </div>

                         <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                             <div className="space-y-3">
                                 {sensitiveWords.length === 0 ? (
                                     <div className="text-center py-10 text-gray-400">
                                         <Ban className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                         <p>词库暂为空</p>
                                     </div>
                                 ) : (
                                     sensitiveWords.map(word => (
                                         <div key={word.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all">
                                             <div className="flex items-center gap-4 flex-1">
                                                 <div className="font-medium text-gray-800 break-all">{word.target}</div>
                                                 <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                                                 <div className="font-mono text-sm font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100 shrink-0">{word.placeholder}</div>
                                             </div>
                                             <div className="flex items-center gap-2 ml-4">
                                                 <button 
                                                    onClick={() => setEditingWord(word)}
                                                    className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors"
                                                 >
                                                     <Settings className="w-4 h-4" />
                                                 </button>
                                                 <button 
                                                    onClick={() => deleteLibraryWord(word.id)}
                                                    className="text-gray-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                                                 >
                                                     <Trash2 className="w-4 h-4" />
                                                 </button>
                                             </div>
                                         </div>
                                     ))
                                 )}
                             </div>
                         </div>
                         <div className="p-4 border-t bg-white rounded-b-2xl flex justify-end">
                             <button onClick={() => setShowLibraryModal(false)} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors">
                                 完成
                             </button>
                         </div>
                     </div>
                </div>
            )}

            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2 rounded-lg border border-blue-400/30">
                        <Shield className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-white font-bold text-lg">本地隐私脱敏工作台</h2>
                        <p className="text-slate-400 text-xs">所有替换均在本地浏览器完成，原文绝不上传</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={onSkip}
                        className="text-slate-400 hover:text-white text-sm px-4"
                    >
                        跳过 (直接审查原文)
                    </button>
                    <button 
                        onClick={() => onComplete(computedData.text, computedData.map)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/50"
                    >
                        <Lock className="w-4 h-4" />
                        审查脱敏文件
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50/50 shrink-0">
                        <div className="flex bg-gray-200 rounded-lg p-1">
                             <button 
                                onClick={() => setViewMode('masked')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${viewMode === 'masked' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <EyeOff className="w-4 h-4" /> 
                                脱敏模式
                            </button>
                            <button 
                                onClick={() => setViewMode('original')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${viewMode === 'original' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Eye className="w-4 h-4" /> 
                                原文模式
                            </button>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                           <Highlighter className="w-3 h-3" />
                           请直接选中下方文本以添加新的遮蔽规则 (将替换全文所有匹配项)
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth" ref={containerRef}>
                         <div 
                            ref={textRef}
                            onMouseUp={handleTextMouseUp}
                            className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-600 selection:bg-blue-200 selection:text-blue-900 min-h-[500px]"
                         >
                             {viewMode === 'original' ? (
                                 <span>{originalContent}</span>
                             ) : (
                                 computedData.text.split(/(\[.*?\])/g).map((part, idx) => {
                                     if (part.startsWith('[') && part.endsWith(']')) {
                                         const isManual = sensitiveWords.some(r => r.placeholder === part);
                                         return (
                                             <span 
                                                key={idx} 
                                                onMouseEnter={(e) => handleMouseEnterTag(e, part)}
                                                onMouseLeave={handleMouseLeaveTag}
                                                className={`
                                                    px-1.5 py-0.5 rounded mx-0.5 text-xs font-bold border select-none inline-block cursor-help transition-colors
                                                    ${isManual ? 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200' : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300'}
                                                `}
                                             >
                                                 {part}
                                             </span>
                                         )
                                     }
                                     return part;
                                 })
                             )}
                         </div>
                         
                         {selection && popupPos && (
                             <div 
                                style={{ top: popupPos.top, left: popupPos.left }}
                                onMouseUp={(e) => e.stopPropagation()}
                                className="absolute -translate-x-1/2 bg-slate-800 text-white p-5 rounded-xl shadow-2xl flex flex-col gap-4 w-80 animate-in fade-in zoom-in-95 duration-150 z-50 origin-top border border-slate-700"
                             >
                                 <div className="flex justify-between items-start border-b border-slate-700 pb-3">
                                    <div className="w-full">
                                        <div className="flex flex-col gap-2">
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1">将选中的内容</div>
                                                <div className="font-mono text-xs font-medium bg-slate-900/50 p-1.5 px-2 rounded text-slate-200 border border-slate-700/50 break-all">
                                                    {selection}
                                                </div>
                                            </div>
                                            <div className="flex justify-center">
                                                <ArrowRight className="w-4 h-4 text-slate-500 rotate-90 my-[-4px]" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1">替换为标签</div>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => { setSelection(''); setPopupPos(null); }} className="text-slate-500 hover:text-white ml-2"><Trash2 className="w-4 h-4" /></button>
                                 </div>
                                 
                                 <div className="flex gap-2">
                                     <input 
                                        value={customPlaceholder}
                                        onChange={(e) => setCustomPlaceholder(e.target.value)}
                                        placeholder="如 [PARTY_A]" 
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                                     />
                                     <button 
                                        onClick={addManualRule}
                                        disabled={!customPlaceholder}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold shadow-lg shadow-blue-900/20"
                                     >
                                         确定
                                     </button>
                                 </div>
                                 
                                 <div className="grid grid-cols-3 gap-2 pb-1">
                                     {[
                                         { label: '[PARTY_A]', icon: <Building2 className="w-3 h-3" /> },
                                         { label: '[PARTY_B]', icon: <Building2 className="w-3 h-3" /> },
                                         { label: '[ADDRESS]', icon: <MapPin className="w-3 h-3" /> },
                                         { label: '[PROJECT]', icon: <Briefcase className="w-3 h-3" /> },
                                         { label: '[NAME]', icon: <UserCircle className="w-3 h-3" /> },
                                         { label: '[ID_NUM]', icon: <CreditCard className="w-3 h-3" /> }
                                     ].map(tag => (
                                         <button 
                                            key={tag.label}
                                            onClick={() => setCustomPlaceholder(tag.label)}
                                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-700/50 rounded text-xs hover:bg-slate-600 transition-colors border border-slate-600/50 hover:border-slate-500 text-slate-300 hover:text-white"
                                         >
                                             {tag.icon}
                                             <span className="font-mono">{tag.label}</span>
                                         </button>
                                     ))}
                                 </div>
                                 <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800 rotate-45 border-t border-l border-slate-700"></div>
                             </div>
                         )}
                    </div>
                </div>

                <div className="w-80 bg-slate-50 border-l border-gray-200 flex flex-col shrink-0 h-full">
                    <div className="flex-1 overflow-y-auto relative scroll-smooth">
                        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm p-5 border-b border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Wand2 className="w-4 h-4 text-purple-600" />
                                自动规则 (Regex)
                            </h3>
                        </div>
                        <div className="p-4 space-y-3 bg-slate-50">
                            {REGEX_PATTERNS.map(p => (
                                <label key={p.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-all select-none">
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={activeRegexes.has(p.id)}
                                            onChange={() => toggleRegex(p.id)}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" 
                                        />
                                        <span className="text-sm font-medium text-gray-700">{p.label}</span>
                                    </div>
                                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{p.prefix}#]</span>
                                </label>
                            ))}
                        </div>

                        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm p-5 border-b border-gray-200 border-t shadow-sm flex items-center justify-between">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Highlighter className="w-4 h-4 text-blue-600" />
                                手动替换列表
                            </h3>
                            <button 
                                onClick={() => { setEditingWord({}); setShowLibraryModal(true); }}
                                className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-bold flex items-center gap-1 transition-colors"
                            >
                                <Settings className="w-3 h-3" /> 管理词库
                            </button>
                        </div>

                        <div className="p-4 space-y-2 bg-slate-50 min-h-[150px]">
                            {sensitiveWords.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    <Ban className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p>暂无手动规则</p>
                                    <p className="text-xs mt-2">在左侧选中文字即可添加</p>
                                </div>
                            ) : (
                                sensitiveWords.map(rule => (
                                    <div key={rule.id} className="group bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:border-blue-300 transition-all relative">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-xs text-gray-400 uppercase font-bold">替换内容 (全局)</div>
                                            <div className="flex gap-1">
                                                <button onClick={() => { setEditingWord(rule); setShowLibraryModal(true); }} className="text-gray-300 hover:text-blue-500 transition-colors">
                                                    <Settings className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => removeRule(rule.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-sm font-medium text-gray-800 break-all mb-2 bg-gray-50 p-1.5 rounded border border-gray-100">{rule.target}</div>
                                        <div className="flex items-center gap-2">
                                            <ArrowRight className="w-3 h-3 text-gray-400" />
                                            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100">{rule.placeholder}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="p-4 bg-white border-t border-gray-200 text-xs text-gray-500 flex justify-between shrink-0 z-20">
                         <span>已掩盖敏感词:</span>
                         <span className="font-bold text-gray-800">{computedData.totalCount} 处</span>
                    </div>
                </div>
            </div>
        </div>
    );
};