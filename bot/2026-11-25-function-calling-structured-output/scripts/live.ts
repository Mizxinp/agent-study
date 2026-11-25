const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'];
console.log(keys.some(key => !process.env[key])
  ? '跳过：缺少密钥'
  : '跳过：本实验只运行离线路径');
