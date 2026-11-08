import SectionTitle from '../components/SectionTitle'

interface TermsSectionProps {
  title: string
  children: React.ReactNode
}

function TermsSection({ title, children }: TermsSectionProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6 md:p-8">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  )
}

export default function Terms() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
      {/* 官网、App Store 和应用内入口共用唯一用户协议，禁止形成互相冲突的内容授权口径。 */}
      <SectionTitle
        subtitle="服务与内容规则"
        title="公民与公民钱包用户协议"
        description="本协议适用于 CitizenApp 公民与 CitizenWallet 公民钱包，规定账户、内容、钱包、安全和服务使用边界。"
      />

      <div className="mb-8 rounded-xl border border-gold-500/20 bg-gold-500/5 px-5 py-4 text-sm text-slate-300">
        生效及最近更新日期：2026 年 8 月 12 日
      </div>

      <div className="space-y-6">
        <TermsSection title="一、协议适用与接受">
          <p>本协议由用户与中华民族联邦共和国公民储备委员会共同遵守，适用于公民和公民钱包。</p>
          <p>下载、访问或使用产品即表示用户已经阅读并同意本协议及隐私政策；不同意时应停止使用产品。</p>
        </TermsSection>

        <TermsSection title="二、账户、CID 与钱包控制权">
          <p>一个钱包 AccountId 可以依链上规则绑定一个 CID。当前默认钱包账户决定当前默认用户；切换默认账户不删除其他 CID 的本地数据。</p>
          <p>注册、注销、换绑、发布、订阅和交易等动权或动钱操作，以用户签名且链上最终确认的结果为准。</p>
          <p>用户必须自行保护设备、助记词、私钥和恢复资料。运营方不会索取助记词或私钥，也无法恢复遗失的根机密。</p>
        </TermsSection>

        <TermsSection title="三、用户发布内容与授权">
          <p>用户保留其合法拥有的公文、文章、视频、图片、音频和其他原创内容的权利，并保证拥有发布及授权所需的全部权利。</p>
          <p>为提供存储、传输、展示、分发、格式转换、内容审核和备份功能，用户授予运营方全球范围、非独占、免许可费、可再许可且仅限运营和推广产品所必需的使用许可。</p>
          <p>该许可不转移内容所有权；在内容被删除且不再承担法定留存、安全审计或链上不可变记录义务后，许可在相应范围内终止。</p>
        </TermsSection>

        <TermsSection title="四、禁止内容与行为">
          <p>不得发布侵权、欺诈、骚扰、威胁、仇恨、剥削未成年人、露骨色情、恶意软件、违法交易或其他违反适用法律及他人合法权益的内容。</p>
          <p>不得冒用他人身份、操纵服务、绕过权限、批量滥用接口、破坏端到端加密或诱导他人提交助记词、私钥、密码和验证码。</p>
          <p>竞选身份用户发布的内容依产品规则进入竞选分类，不得通过伪造身份或规避链上状态改变分类。</p>
        </TermsSection>

        <TermsSection title="五、举报、处置与申诉">
          <p>用户可以通过技术支持页面的公开渠道举报违法、侵权或违反本协议的内容，并应提供内容位置、理由和不包含钱包根机密的必要证据。</p>
          <p>运营方可以依法采取限制展示、停止分发、删除服务端副本、限制账户功能或保存必要证据等措施；紧急安全风险可以先处置后通知。</p>
          <p>被处置用户可以通过同一渠道提出申诉。链上已经最终确认的公开记录不能由运营方单方面篡改或删除，但可停止在应用服务中继续分发。</p>
        </TermsSection>

        <TermsSection title="六、订阅、费用与交易">
          <p>链上交易可能产生协议交易费；发布、订阅、充值或转账前，产品应展示由相应流程确定的金额或规则。</p>
          <p>链上最终确认的交易通常不可撤销。因用户签错账户、地址、金额或泄露密钥造成的损失，由用户承担；产品自身错误依法另行处理。</p>
        </TermsSection>

        <TermsSection title="七、公民钱包离线边界">
          <p>公民钱包完全离线处理账户恢复、二维码解析和签名，不向运营方服务器上传助记词、私钥、签名请求或签名结果。</p>
          <p>删除应用、清除设备数据或遗失设备可能导致钱包不可恢复；用户应在操作前验证离线备份可用。</p>
        </TermsSection>

        <TermsSection title="八、服务变更、停止与责任边界">
          <p>我们可能为安全、法律、网络升级或产品维护调整服务，并在适用情况下提前通知。紧急漏洞或攻击处置可以立即实施。</p>
          <p>开源网络、区块链、设备系统、应用商店和第三方基础设施可能发生中断；我们会采取合理措施恢复，但不承诺服务永不中断。</p>
        </TermsSection>

        <TermsSection title="九、协议更新与联系">
          <p>协议发生实质变化时，我们会更新本页面和生效日期，并在适用情况下要求用户重新确认。</p>
          <p>协议、内容权利、举报或申诉问题请通过本站“技术支持”页面的公开渠道联系，严禁发送助记词、私钥、密码或验证码。</p>
        </TermsSection>
      </div>
    </div>
  )
}
