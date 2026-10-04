import SectionTitle from '../components/SectionTitle'

const supportItems = [
  {
    title: '公民账户与 CID',
    content: 'CID 注册、注销和绑定 AccountId 等动权操作以公民链最终确认状态为准；普通资料、广场和聊天服务由公民服务端处理。',
  },
  {
    title: '公民聊天',
    content: '聊天使用端到端加密。遇到设备密钥或会话异常时，请保留错误发生时间、设备型号、系统版本和不含私密内容的错误提示。',
  },
  {
    title: '公民钱包恢复',
    content: '公民钱包完全离线运行。更换设备或删除 App 前必须确认助记词已经离线备份；运营方无法恢复遗失的助记词或私钥。',
  },
  {
    title: '安全事件',
    content: '发现密钥泄露、错误签名、账户异常或产品安全问题时，请立即停止相关操作，并通过下方公开问题渠道提交不包含助记词、私钥或验证码的报告。',
  },
]

export default function Support() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
      {/* 本页作为 App Store 技术支持 URL，不接收或要求用户提交任何钱包根机密。 */}
      <SectionTitle
        subtitle="产品支持"
        title="公民产品技术支持"
        description="适用于 CitizenApp 公民与 CitizenWallet 公民钱包。提交问题时禁止附带助记词、私钥、密码、验证码或未加密的身份档案。"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {supportItems.map((item) => (
          <section key={item.title} className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">{item.title}</h2>
            <p className="text-sm leading-7 text-slate-300">{item.content}</p>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-gold-500/20 bg-gold-500/5 p-6 md:p-8">
        <h2 className="mb-3 text-xl font-semibold text-white">公开问题渠道</h2>
        <p className="mb-5 text-sm leading-7 text-slate-300">
          对于不包含个人隐私或安全机密的一般产品问题，可以在 GMB 官方代码仓库提交问题。涉及隐私或安全事件时，请先移除所有敏感信息，只提供复现所需的最少资料。
        </p>
        <a
          href="https://github.com/crcfrcn/citizenweb/issues"
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-lg border border-gold-400/40 bg-gold-500/10 px-5 py-3 text-sm font-semibold text-gold-300 no-underline transition-colors hover:bg-gold-500/20"
        >
          前往官方问题页面
        </a>
      </section>
    </div>
  )
}
