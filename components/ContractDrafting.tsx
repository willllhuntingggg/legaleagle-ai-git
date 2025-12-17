
import React, { useState, useEffect } from 'react';
import { draftNewContract } from '../services/geminiService';
import { FileText, Loader2, Download, PenTool, RefreshCw, Cpu, Key } from 'lucide-react';
import { ModelProvider } from '../types';

const CONTRACT_TEMPLATES: Record<string, string> = {
  '服务合同 (Service Agreement)': `1. 委托内容：甲方委托乙方进行【具体服务内容，如：软件开发/咨询服务】。
2. 服务期限：自【开始日期】起至【结束日期】止。
3. 费用及支付：服务总费用为人民币【金额】元，合同签订后支付【比例】%预付款，验收合格后支付剩余尾款。
4. 交付标准：乙方应按【交付标准/需求文档】提交成果，甲方应在【天数】内完成验收。
5. 违约责任：任何一方违约需支付违约金人民币【金额】元或合同总额的【比例】%。`,
  
  '保密协议 (NDA)': `1. 保密信息定义：包括但不限于商业计划、客户名单、技术数据、财务信息等。
2. 保密义务：接收方不得向任何第三方披露保密信息，仅可用于【特定目的】。
3. 保密期限：本协议有效期为【年数】年，或保密信息成为公众知悉信息之前。
4. 违约责任：若违反保密义务，需支付违约金人民币【金额】元，并赔偿因此造成的一切损失。`,
  
  '劳动合同 (Employment Contract)': `1. 工作岗位：乙方担任【职位名称】，工作地点为【城市/地址】。
2. 合同期限：固定期限【年数】年，其中试用期【月数】个月。
3. 劳动报酬：月基本工资为税前人民币【金额】元，每月【日期】日发放。
4. 社会保险：甲方依法为乙方缴纳社保和公积金。
5. 解除合同：乙方严重违反公司规章制度的，甲方有权解除合同。`,
  
  '房屋租赁合同 (Lease Agreement)': `1. 租赁标的：位于【房屋地址】的房屋，面积【平方米】平米。
2. 租赁期限：自【日期】起至【日期】止，共【月数】个月。
3. 租金及支付：月租金【金额】元，押【月数】付【月数】，每月【日期】日前支付。
4. 房屋维护：租赁期间房屋主体结构的维修由甲方负责，日常消耗品维修由乙方负责。
5. 转租约定：未经甲方书面同意，乙方不得擅自转租。`,
  
  '销售合同 (Sales Contract)': `1. 产品信息：产品名称【名称】，规格【型号】，数量【数量】，单价【金额】。
2. 合同总价：人民币【总金额】元（含税）。
3. 交货方式：甲方负责运输至【收货地址】，运费由【方】承担。
4. 验收标准：货到【天数】天内开箱检验，如有质量问题【天数】天内提出。
5. 结算方式：合同签订付【比例】%，发货前付【比例】%。`
};

export const ContractDrafting: React.FC = () => {
  const [type, setType] = useState('服务合同 (Service Agreement)');
  const [requirements, setRequirements] = useState(CONTRACT_TEMPLATES['服务合同 (Service Agreement)']);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelProvider, setModelProvider] = useState<ModelProvider>(ModelProvider.GEMINI);
  const [apiKey, setApiKey] = useState('');

  // API Key Persistence Logic
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

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (CONTRACT_TEMPLATES[newType]) {
        setRequirements(CONTRACT_TEMPLATES[newType]);
    } else {
        setRequirements('');
    }
  };

  const handleDraft = async () => {
    if (!apiKey) {
        alert("请输入 API Key 后再开始生成");
        return;
    }
    setLoading(true);
    const text = await draftNewContract(type, requirements, modelProvider, apiKey);
    setResult(text);
    setLoading(false);
  };
  
  const handleDownload = () => {
      if (!result) return;
      const element = document.createElement("a");
      const file = new Blob([result], {type: 'application/msword'});
      element.href = URL.createObjectURL(file);
      element.download = `${type.split(' ')[0]}_Draft.doc`;
      document.body.appendChild(element);
      element.click();
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header - Fixed */}
      <div className="px-8 py-6 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PenTool className="w-6 h-6 text-blue-600" />
            智能起草
        </h2>
        <p className="text-gray-500 mt-1">输入您的需求，AI 将为您生成专业的合同草案。</p>
      </div>

      {/* Content Area - Flexes to fill remaining height */}
      <div className="flex-1 overflow-hidden p-8 max-w-7xl mx-auto w-full">
          <div className="flex gap-8 h-full">
            
            {/* Left Panel: Inputs */}
            <div className="w-1/3 flex flex-col h-full overflow-y-auto pr-2 scrollbar-thin">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
                
                <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2">生成模型</label>
                    <div className="relative">
                        <select 
                            value={modelProvider}
                            onChange={(e) => {
                                setModelProvider(e.target.value as ModelProvider);
                            }}
                            className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                        >
                            {Object.values(ModelProvider).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <Cpu className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    </div>
                </div>

                <div className="mb-4 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        API Key <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <input 
                            type="password"
                            value={apiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                            placeholder={`请输入 ${modelProvider.split(' ')[0]} API Key`}
                            className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <Key className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    </div>
                     <p className="text-xs text-gray-400 mt-1 ml-1">
                        Key 仅存储在本地浏览器，不会上传服务器。
                    </p>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">合同类型</label>
                    <select 
                      className="w-full border border-gray-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                      value={type}
                      onChange={e => handleTypeChange(e.target.value)}
                    >
                      {Object.keys(CONTRACT_TEMPLATES).map(key => (
                          <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-gray-700">关键条款需求</label>
                        <button 
                            onClick={() => setRequirements(CONTRACT_TEMPLATES[type])}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            title="重置为默认模板"
                        >
                            <RefreshCw className="w-3 h-3" /> 重置示例
                        </button>
                    </div>
                    <textarea 
                      className="w-full flex-1 border border-gray-300 p-4 rounded-lg text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50 focus:bg-white transition-colors font-mono"
                      placeholder="请输入具体的合同要求..."
                      value={requirements}
                      onChange={e => setRequirements(e.target.value)}
                    />
                </div>

                <button 
                  onClick={handleDraft}
                  disabled={loading || !requirements}
                  className="w-full mt-6 bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 disabled:opacity-50 flex justify-center items-center gap-2 font-bold transition-all hover:scale-[1.02] shadow-lg shadow-slate-200"
                >
                  {loading ? (
                    <>
                        <Loader2 className="animate-spin w-5 h-5" />
                        正在生成...
                    </>
                  ) : '开始生成合同'}
                </button>
              </div>
            </div>

            {/* Right Panel: Result */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden h-full relative">
              {result ? (
                 <>
                    {/* Fixed Toolbar inside the panel */}
                    <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/80 backdrop-blur shrink-0 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <FileText className="w-4 h-4 text-blue-600" />
                             <span className="font-bold text-gray-700 text-sm">合同预览</span>
                        </div>
                        <button 
                            onClick={handleDownload}
                            className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Download className="w-4 h-4" /> 下载文档
                        </button>
                    </div>
                    
                    {/* Scrollable Document Content */}
                    <div className="flex-1 overflow-y-auto p-8 bg-white">
                        <div className="prose prose-sm max-w-none font-mono whitespace-pre-wrap text-gray-800 leading-7">
                            {result}
                        </div>
                    </div>
                 </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50/30">
                    <div className="bg-gray-100 p-6 rounded-full mb-4">
                         <FileText className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-500">在此处预览生成的合同草案</p>
                    <p className="text-sm mt-2 max-w-xs text-center">请在左侧填写需求并点击“开始生成合同”</p>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};
