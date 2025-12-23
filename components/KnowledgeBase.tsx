
import React, { useState } from 'react';
import { KnowledgeRule, RiskLevel } from '../types';
import { Plus, Trash2, BookOpen, AlertCircle } from 'lucide-react';

interface KnowledgeBaseProps {
  rules: KnowledgeRule[];
  onUpdateRules: (rules: KnowledgeRule[]) => void;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ rules, onUpdateRules }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState<Partial<KnowledgeRule>>({ riskLevel: RiskLevel.MEDIUM, category: '通用' });

  const handleAdd = () => {
    if (newRule.name && newRule.description) {
      const updatedRules = [...rules, { ...newRule, id: Date.now().toString() } as KnowledgeRule];
      onUpdateRules(updatedRules);
      setShowAddForm(false);
      setNewRule({ riskLevel: RiskLevel.MEDIUM, category: '通用' });
    }
  };

  const handleRemove = (id: string) => {
    const updatedRules = rules.filter(r => r.id !== id);
    onUpdateRules(updatedRules);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-8 border-b border-gray-200 bg-white shrink-0 flex justify-between items-center shadow-sm">
        <div>
           <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
                审查知识库
           </h2>
           <p className="text-gray-500 mt-1">AI 将根据下方定义的规则清单对合同进行审查。</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold"
        >
          <Plus className="w-4 h-4" />
          新增规则
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
          {showAddForm && (
            <div className="bg-white p-6 rounded-xl border border-blue-200 shadow-lg mb-8 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-bold text-lg mb-4 text-slate-800">添加审查准则</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">规则名称</label>
                    <input 
                      placeholder="例如: 延迟交付违约金"
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newRule.name || ''}
                      onChange={e => setNewRule({...newRule, name: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">风险等级</label>
                    <select 
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newRule.riskLevel}
                      onChange={e => setNewRule({...newRule, riskLevel: e.target.value as RiskLevel})}
                    >
                      {Object.values(RiskLevel).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
              </div>
              <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">详细描述 (AI 审查依据)</label>
                  <textarea 
                    placeholder="请详细描述此规则。例如：违约金不应低于合同金额的 20%，且应包含具体的支付期限。"
                    className="w-full border p-2 rounded h-24 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newRule.description || ''}
                    onChange={e => setNewRule({...newRule, description: e.target.value})}
                  />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-gray-600 font-medium">取消</button>
                <button onClick={handleAdd} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-100">保存规则</button>
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {rules.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p>暂无自定义规则，请点击上方按钮添加。</p>
                </div>
            ) : (
                rules.map(rule => (
                  <div key={rule.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between group hover:border-blue-300 transition-all">
                    <div className="flex gap-4">
                      <div className={`p-2 rounded-lg h-fit ${
                         rule.riskLevel === RiskLevel.HIGH ? 'bg-red-50 text-red-600' :
                         rule.riskLevel === RiskLevel.MEDIUM ? 'bg-orange-50 text-orange-600' : 'bg-yellow-50 text-yellow-600'
                      }`}>
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{rule.name}</h3>
                        <p className="text-gray-600 mt-2 leading-relaxed">{rule.description}</p>
                        <div className="mt-3 flex gap-2">
                            <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">类别: {rule.category}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                rule.riskLevel === RiskLevel.HIGH ? 'bg-red-100 text-red-700' :
                                rule.riskLevel === RiskLevel.MEDIUM ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                                {rule.riskLevel}
                            </span>
                        </div>
                      </div>
                    </div>
                    <button 
                        onClick={() => handleRemove(rule.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-2"
                        title="删除规则"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))
            )}
          </div>
      </div>
    </div>
  );
};
