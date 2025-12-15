
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Lock, Eye, EyeOff, Plus, Trash2, ArrowRight, ScanLine, Wand2, RefreshCcw, Highlighter, CreditCard } from 'lucide-react';
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
        regex: /(\$|¥|€|£)\s?(\d{1,3}(,\d{3})*(\.\d+)?)|(\d+(\.\d+)?\s?(元|万元|dollars|USD))/gi,
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
        label: '手机/身份证 (ID/Phone)', 
        regex: /(1[3-9]\d{9})|(\d{15}|\d{18})/g, 
        prefix: '[ID_' 
    },
    { 
        id: 'bank',
        label: '银行卡号 (Bank Card)', 
        regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{3,4}\b/g, 
        prefix: '[BANK_' 
    }
];

export const PrivacyGuard: React.FC<PrivacyGuardProps> = ({ originalContent, onComplete, onSkip }) => {
    // Selection State
    const [manualRules, setManualRules] = useState<ManualRule[]>([]);
    const [activeRegexes, setActiveRegexes] = useState<Set<string>>(new Set(['money', 'email', 'date', 'phone', 'bank']));
    
    // UI State
    const [previewMode, setPreviewMode] = useState<'original' | 'masked'>('original');
    const [selection, setSelection] = useState<string>('');
    const [customPlaceholder, setCustomPlaceholder] = useState('');
    const [popupPos, setPopupPos] = useState<{top: number, left: number} | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // Compute Masked Content & Map
    const computedData = useMemo(() => {
        let text = originalContent;
        const map: MaskingMap = {};
        
        // 1. Apply Manual Rules First (User defined entities usually take precedence)
        // Sort by length desc to prevent partial replacements causing issues
        const sortedRules = [...manualRules].sort((a, b) => b.target.length - a.target.length);
        
        sortedRules.forEach(rule => {
            if (!rule.target) return;
            // Escape special regex chars in target string
            const escapedTarget = rule.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedTarget, 'g');
            
            // Only add to map if it actually exists in text
            if (regex.test(text)) {
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
                    return placeholder;
                });
            }
        });

        return { text, map };
    }, [originalContent, manualRules, activeRegexes]);

    const handleTextMouseUp = () => {
        const selectionObj = window.getSelection();
        
        // Ensure we have a valid selection that is not empty
        if (selectionObj && selectionObj.toString().trim().length > 0) {
            const text = selectionObj.toString().trim();
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
                // Add container.scrollTop to account for scrolling
                setPopupPos({
                    top: rect.bottom - containerRect.top + containerRef.current.scrollTop + 10,
                    left: rect.left - containerRect.left + (rect.width / 2)
                });
            }
        } else {
            // If user clicks without selecting, clear the popup
            // We check if the click was inside the popup (which is handled by stopPropagation usually, but good to be safe)
            // Since this handler is on the text div, clicks outside text div won't trigger this.
            // Clicks on text div that clear selection trigger this with empty string.
            setSelection('');
            setPopupPos(null);
        }
    };

    const addManualRule = () => {
        if (selection && customPlaceholder) {
            setManualRules([...manualRules, {
                id: Date.now().toString(),
                target: selection,
                placeholder: customPlaceholder
            }]);
            setSelection('');
            setCustomPlaceholder('');
            setPopupPos(null);
            // Switch to preview to show effect
            setPreviewMode('masked');
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

    return (
        <div className="flex flex-col h-full bg-slate-50">
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
                        跳过 (直接上传原文)
                    </button>
                    <button 
                        onClick={() => onComplete(computedData.text, computedData.map)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/50"
                    >
                        <Lock className="w-4 h-4" />
                        生成脱敏文件并审查
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left: Text Editor/Preview */}
                <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
                        <div className="flex bg-gray-200 rounded-lg p-1">
                            <button 
                                onClick={() => setPreviewMode('original')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${previewMode === 'original' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                            >
                                <Eye className="w-4 h-4" /> 编辑源文本
                            </button>
                            <button 
                                onClick={() => setPreviewMode('masked')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${previewMode === 'masked' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                            >
                                <EyeOff className="w-4 h-4" /> 预览脱敏结果
                            </button>
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                           <Shield className="w-3 h-3" />
                           {previewMode === 'original' ? '请选择敏感文本进行替换' : 'AI 将仅看到此版本'}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 relative" ref={containerRef}>
                         {previewMode === 'original' ? (
                             <div 
                                ref={textRef}
                                onMouseUp={handleTextMouseUp}
                                className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-800 selection:bg-blue-200 selection:text-blue-900 min-h-[500px]"
                             >
                                 {originalContent}
                             </div>
                         ) : (
                             <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-600">
                                 {computedData.text.split(/(\[.*?\])/g).map((part, idx) => {
                                     if (part.startsWith('[') && part.endsWith(']')) {
                                         return <span key={idx} className="bg-gray-200 text-gray-600 px-1 rounded mx-0.5 text-xs font-bold border border-gray-300 select-none">{part}</span>
                                     }
                                     return part;
                                 })}
                             </div>
                         )}
                         
                         {/* Selection Float Menu - Absolutely positioned relative to container */}
                         {selection && previewMode === 'original' && popupPos && (
                             <div 
                                style={{ top: popupPos.top, left: popupPos.left }}
                                onMouseUp={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                                className="absolute -translate-x-1/2 bg-slate-800 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-3 w-80 animate-in fade-in zoom-in-95 duration-150 z-50 origin-top"
                             >
                                 <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-xs text-slate-400 mb-1">已选中内容:</div>
                                        <div className="font-mono text-sm font-bold truncate max-w-[200px] bg-slate-900 p-1 px-2 rounded">{selection}</div>
                                    </div>
                                    <button onClick={() => { setSelection(''); setPopupPos(null); }} className="text-slate-500 hover:text-white"><Trash2 className="w-4 h-4" /></button>
                                 </div>
                                 <div className="flex gap-2">
                                     <input 
                                        value={customPlaceholder}
                                        onChange={(e) => setCustomPlaceholder(e.target.value)}
                                        placeholder="输入替换词 (如 [PARTY_A])" 
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                                     />
                                     <button 
                                        onClick={addManualRule}
                                        disabled={!customPlaceholder}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm font-bold"
                                     >
                                         替换
                                     </button>
                                 </div>
                                 <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                     {['[PARTY_A]', '[PARTY_B]', '[COMPANY]', '[NAME]'].map(tag => (
                                         <button 
                                            key={tag}
                                            onClick={() => setCustomPlaceholder(tag)}
                                            className="whitespace-nowrap px-2 py-1 bg-slate-700 rounded text-xs hover:bg-slate-600 transition-colors"
                                         >
                                             {tag}
                                         </button>
                                     ))}
                                 </div>
                                 
                                 {/* Arrow Pointer */}
                                 <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-800 rotate-45"></div>
                             </div>
                         )}
                    </div>
                </div>

                {/* Right: Rules Panel */}
                <div className="w-80 bg-slate-50 border-l border-gray-200 flex flex-col">
                    <div className="p-5 border-b border-gray-200 bg-white">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-purple-600" />
                            自动规则 (Regex)
                        </h3>
                    </div>
                    <div className="p-4 space-y-3 border-b border-gray-200">
                        {REGEX_PATTERNS.map(p => (
                            <label key={p.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
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

                    <div className="p-5 border-b border-gray-200 bg-white mt-2">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Highlighter className="w-4 h-4 text-blue-600" />
                            手动替换列表
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {manualRules.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                <p>暂无手动规则</p>
                                <p className="text-xs mt-2">在左侧选中文字即可添加</p>
                            </div>
                        ) : (
                            manualRules.map(rule => (
                                <div key={rule.id} className="group bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:border-blue-300 transition-all">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-xs text-gray-400 uppercase font-bold">Original</div>
                                        <button onClick={() => removeRule(rule.id)} className="text-gray-300 hover:text-red-500">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="text-sm font-medium text-gray-800 break-all mb-2">{rule.target}</div>
                                    <div className="flex items-center gap-2">
                                        <ArrowRight className="w-3 h-3 text-gray-400" />
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">{rule.placeholder}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    {/* Stats Footer */}
                    <div className="p-4 bg-white border-t border-gray-200 text-xs text-gray-500 flex justify-between">
                         <span>已掩盖敏感词:</span>
                         <span className="font-bold text-gray-800">{Object.keys(computedData.map).length} 处</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
