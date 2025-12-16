
import React, { useState } from 'react';
import { KnowledgeRule, RiskLevel } from '../types';
import { Plus, Trash2, BookOpen, AlertCircle } from 'lucide-react';

const MOCK_RULES: KnowledgeRule[] = [
  { id: '1', category: 'General', name: 'Liability Cap', description: 'Liability should not exceed 100% of contract value.', riskLevel: RiskLevel.HIGH },
  { id: '2', category: 'Payment', name: 'Payment Terms', description: 'Payment terms must not exceed 60 days.', riskLevel: RiskLevel.MEDIUM },
  { id: '3', category: 'Termination', name: 'Mutual Termination', description: 'Both parties must have right to terminate for convenience.', riskLevel: RiskLevel.MEDIUM },
];

export const KnowledgeBase: React.FC = () => {
  const [rules, setRules] = useState<KnowledgeRule[]>(MOCK_RULES);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState<Partial<KnowledgeRule>>({ riskLevel: RiskLevel.MEDIUM });

  const handleAdd = () => {
    if (newRule.name && newRule.description) {
      setRules([...rules, { ...newRule, id: Date.now().toString() } as KnowledgeRule]);
      setShowAddForm(false);
      setNewRule({ riskLevel: RiskLevel.MEDIUM });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header - Fixed */}
      <div className="p-8 border-b border-gray-200 bg-white shrink-0 flex justify-between items-center shadow-sm">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
                审查知识库
           </h2>
           <p className="text-gray-500 mt-1">管理 AI 审查合同时使用的规则清单。</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新增规则
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
          {showAddForm && (
            <div className="bg-white p-6 rounded-xl border border-blue-200 shadow-lg mb-8 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-semibold mb-4">添加新规则</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input 
                  placeholder="规则名称 (例如: 违约金上限)"
                  className="border p-2 rounded"
                  value={newRule.name || ''}
                  onChange={e => setNewRule({...newRule, name: e.target.value})}
                />
                <select 
                  className="border p-2 rounded"
                  value={newRule.riskLevel}
                  onChange={e => setNewRule({...newRule, riskLevel: e.target.value as RiskLevel})}
                >
                  {Object.values(RiskLevel).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <textarea 
                placeholder="规则详细描述 (AI 将以此为依据进行审查)..."
                className="w-full border p-2 rounded mb-4 h-24"
                value={newRule.description || ''}
                onChange={e => setNewRule({...newRule, description: e.target.value})}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-gray-600">取消</button>
                <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded">保存规则</button>
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {rules.map(rule => (
              <div key={rule.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between group hover:border-blue-300 transition-all">
                <div className="flex gap-4">
                  <div className={`p-2 rounded-lg h-fit ${
                     rule.riskLevel === RiskLevel.HIGH ? 'bg-red-50 text-red-600' :
                     rule.riskLevel === RiskLevel.MEDIUM ? 'bg-orange-50 text-orange-600' : 'bg-yellow-50 text-yellow-600'
                  }`}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{rule.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{rule.description}</p>
                    <div className="mt-2 text-xs text-gray-400 bg-gray-100 w-fit px-2 py-1 rounded">Category: {rule.category}</div>
                  </div>
                </div>
                <button 
                    onClick={() => setRules(rules.filter(r => r.id !== rule.id))}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
};
