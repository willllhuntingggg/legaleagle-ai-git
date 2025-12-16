import React, { useState, useMemo, useRef } from 'react';
import { Shield, Lock, Trash2, ArrowRight, Wand2, Highlighter, CreditCard, MapPin, Phone, Ban, Building2, User, Users, UserCircle, Briefcase, Eye, EyeOff } from 'lucide-react';
import { MaskingMap } from '../types';

interface PrivacyGuardProps {
    originalContent: string;
    onComplete: (maskedContent: string, map: MaskingMap) => void;
    onSkip: () => void;
}

interface ManualRule {
    id: string;
    target: string;
    placeholder: string;
}

const REGEX_PATTERNS = [
    { 
        id: 'money',
        label: '金额 (Money)', 
        // Improved Regex:
        // 1. Symbols: Matches $, ¥, ￥(fullwidth), £, €, RMB, CNY
        // 2. Formats: 100,000.00 | 4万 | 100元 | 100美金
        regex: /((RMB|CNY|¥|￥|\$|€|£)\s?([1-9]\d{0,2}(,\d{3})*|0)(\.\d{1,2})?)|(([1-9]\d{0,2}(,\d{3})*|0)(\.\d{1,2})?\s?(元|万元|亿元|万|亿|USD|Dollars|美金))/gi,
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
        // Matches: 
        // 1. Mobile (11 digits, optional +86)
        // 2. Landline with loose spacing (010- 12345678)
        // 3. ID cards (15 or 18 digits)
        regex: /((\+?86)?\s?1[3-9]\d{9})|(\d{3,4}\s*[-]\s*\d{7,8})|(\d{15}|\d{18})/g, 
        prefix: '[PHONE_' 
    },
    { 
        id: 'bank',
        label: '银行卡号 (Bank Card)', 
        // 12 to 30 digits. 
        // Uses \b for standard numbers, but allows non-boundary matches for long continuous digits 
        // to catch cases like ID331156037195 where \b would fail after 'D'.
        regex: /(?:\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{0,10}\b)|(?:\d{12,30})/g, 
        prefix: '[BANK_' 
    }
];

export const PrivacyGuard: React.FC<PrivacyGuardProps> = ({ originalContent, onComplete, onSkip }) => {
    // Selection State
    const [manualRules, setManualRules] = useState<ManualRule[]>([]);
    // Default active regexes: REMOVED 'company' entirely
    const [activeRegexes, setActiveRegexes] = useState<Set<string>>(new Set(['money', 'email', 'date', 'phone', 'bank']));
    
    // UI State
    const [selection, setSelection] = useState<string>('');
    const [customPlaceholder, setCustomPlaceholder] = useState('');
    const [popupPos, setPopupPos] = useState<{top: number, left: number} | null>(null);
    const [viewMode, setViewMode] = useState<'masked' | 'original'>('masked');
    
    // Custom Tooltip State
    const [hoverTooltip, setHoverTooltip] = useState<{text: string, x: number, y: number} | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // Compute Masked Content & Map
    const computedData = useMemo(() => {
        let text = originalContent;
        const map: MaskingMap = {};
        let totalCount = 0;
        
        // 1. Apply Manual Rules First (User defined entities usually take precedence)
        // Sort by length desc to prevent partial replacements (e.g. mask "Tech" inside "TechCorp")
        const sortedRules = [...manualRules].sort((a, b) => b.target.length - a.target.length);
        
        sortedRules.forEach(rule => {
            if (!rule.target) return;
            // Escape special regex chars in target string to ensure safe regex creation
            let patternString = rule.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // SMART BRACKET SUBSTITUTION:
            // If the user selected text with brackets, we want to match BOTH full-width '（）' and half-width '()'
            // regardless of which one they selected.
            // Replace literal (escaped) '(' or raw '（' with class containing both
            patternString = patternString.replace(/(\\\(|（)/g, '[\\(（]');
            // Replace literal (escaped) ')' or raw '）' with class containing both
            patternString = patternString.replace(/(\\\)|）)/g, '[\\)）]');

            // Global flag 'g' ensures ALL instances are replaced throughout the document
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
    }, [originalContent, manualRules, activeRegexes]);

    const handleTextMouseUp = () => {
        const selectionObj = window.getSelection();
        
        // Ensure we have a valid selection that is not empty
        if (selectionObj && selectionObj.toString().trim().length > 0) {
            const text = selectionObj.toString().trim();
            
            // Prevent selecting text that includes already masked tags (simple heuristic)
            if (text.includes('[') && text.includes(']')) {
                setSelection('');
                setPopupPos(null);
                return;
            }

            setSelection(text);
            
            // Default placeholder suggestion
            if (!customPlaceholder) {
                setCustomPlaceholder('[PARTY_A]');
            }

            // Calculate position relative to the scrolling container
            if (selectionObj.rangeCount > 0 && containerRef.current) {
                const range = selectionObj.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                
                // Position popup centered below the selection
                // Add scrollTop to ensure it stays correct when scrolled
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
            // Remove any existing rules that might conflict (optional, but cleaner)
            const newRules = manualRules.filter(r => r.target !== selection);
            setManualRules([...newRules, {
                id: Date.now().toString(),
                target: selection,
                placeholder: customPlaceholder
            }]);
            
            // Reset interactions
            setSelection('');
            setCustomPlaceholder('');
            setPopupPos(null);
            
            // Clear browser selection
            window.getSelection()?.removeAllRanges();
        }
    };

    const removeRule = (id: string) => {
        setManualRules(manualRules.filter(r => r.id !== id));
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
            // Show tooltip above the element
            setHoverTooltip({
                text: original,
                x: rect.left + rect.width / 2,
                y: rect.top - 8 // Slight gap
            });
        }
    };

    const handleMouseLeaveTag = () => {
        setHoverTooltip(null);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Custom Tooltip */}
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

            {/* Header */}
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
                {/* Left: Text Editor/Preview */}
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
                         {/* Render Computed Text with interactive capabilities */}
                         <div 
                            ref={textRef}
                            onMouseUp={handleTextMouseUp}
                            className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-600 selection:bg-blue-200 selection:text-blue-900 min-h-[500px]"
                         >
                             {viewMode === 'original' ? (
                                 <span>{originalContent}</span>
                             ) : (
                                 computedData.text.split(/(\[.*?\])/g).map((part, idx) => {
                                     // Identify tags and render them as chips
                                     if (part.startsWith('[') && part.endsWith(']')) {
                                         // Check if this tag comes from a manual rule or regex (for styling)
                                         const isManual = manualRules.some(r => r.placeholder === part);
                                         
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
                         
                         {/* Selection Float Menu - Absolutely positioned relative to container */}
                         {selection && popupPos && (
                             <div 
                                style={{ top: popupPos.top, left: popupPos.left }}
                                onMouseUp={(e) => e.stopPropagation()} // Prevent closing when clicking inside
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
                                 
                                 {/* Arrow Pointer */}
                                 <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800 rotate-45 border-t border-l border-slate-700"></div>
                             </div>
                         )}
                    </div>
                </div>

                {/* Right: Rules Panel - Unified Scroll View */}
                <div className="w-80 bg-slate-50 border-l border-gray-200 flex flex-col shrink-0 h-full">
                    {/* Unified Scrolling Container */}
                    <div className="flex-1 overflow-y-auto relative scroll-smooth">
                        
                        {/* Section 1: Regex - Sticky Header */}
                        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm p-5 border-b border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Wand2 className="w-4 h-4 text-purple-600" />
                                自动规则 (Regex)
                            </h3>
                        </div>
                        
                        {/* Regex List */}
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

                        {/* Section 2: Manual - Sticky Header */}
                        {/* Note: 'sticky top-0' works by stacking or pushing previous sticky elements if they are siblings in the same scroll container. */}
                        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm p-5 border-b border-gray-200 border-t shadow-sm">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Highlighter className="w-4 h-4 text-blue-600" />
                                手动替换列表
                            </h3>
                        </div>

                        {/* Manual List */}
                        <div className="p-4 space-y-2 bg-slate-50 min-h-[150px]">
                            {manualRules.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    <Ban className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p>暂无手动规则</p>
                                    <p className="text-xs mt-2">在左侧选中文字即可添加</p>
                                </div>
                            ) : (
                                manualRules.map(rule => (
                                    <div key={rule.id} className="group bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:border-blue-300 transition-all">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-xs text-gray-400 uppercase font-bold">替换内容 (全局)</div>
                                            <button onClick={() => removeRule(rule.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
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
                    
                    {/* Stats Footer - Fixed at bottom */}
                    <div className="p-4 bg-white border-t border-gray-200 text-xs text-gray-500 flex justify-between shrink-0 z-20">
                         <span>已掩盖敏感词:</span>
                         <span className="font-bold text-gray-800">{computedData.totalCount} 处</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
