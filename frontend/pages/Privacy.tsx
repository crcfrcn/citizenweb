import SectionTitle from '../components/SectionTitle'

interface PrivacySectionProps {
  title: string
  children: React.ReactNode
}

function PrivacySection({ title, children }: PrivacySectionProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6 md:p-8">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  )
}

export default function Privacy() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
      {/* App Store 与应用内共用同一份公开政策，避免形成两套隐私口径。 */}
      <SectionTitle
        subtitle="隐私与数据保护"
        title="公民与公民钱包隐私政策"
        description="本政策说明 CitizenApp 公民与 CitizenWallet 公民钱包如何处理数据，以及两款产品不同的安全边界。"
      />

      <div className="mb-8 rounded-xl border border-gold-500/20 bg-gold-500/5 px-5 py-4 text-sm text-slate-300">
        生效及最近更新日期：2026 年 8 月 12 日
      </div>

      <div className="space-y-6">
        <PrivacySection title="一、适用范围与控制者">
          <p>本政策适用于中华民族联邦共和国公民储备委员会提供的 CitizenApp 公民和 CitizenWallet 公民钱包。</p>
          <p>用户发布内容的权利保证、必要服务许可、举报和申诉规则以本站“用户协议”为准。</p>
          <p>如需提出隐私、安全、数据访问或删除请求，请通过本站“技术支持”页面提供的公开渠道联系。</p>
        </PrivacySection>

        <PrivacySection title="二、CitizenApp 公民处理的数据">
          <p>账户与身份数据：CID 公民号、当前绑定的 AccountId、设备标识及为验证签名、维持账户和设备状态所必需的数据。</p>
          <p>公开资料与用户内容：用户主动设置的昵称、头像、背景、个性签名，以及主动发布的公文、文章、视频和相关互动内容。</p>
          <p>订阅与链上活动：订阅关系、创作者档位、链上交易标识和确认状态。链上公开数据依公民链协议公开保存，不能由单一服务方任意修改或删除。</p>
          <p>聊天安全数据：私信和群聊使用端到端加密。服务端只处理投递所需的密文信封、信令、无内容推送和一次性密钥材料，不取得消息明文或私有数据密钥。</p>
          <p>媒体数据：头像、公开内容媒体等由用户主动上传；聊天附件按产品规则采用设备直连或限时密文中转。</p>
        </PrivacySection>

        <PrivacySection title="三、CitizenWallet 公民钱包的离线边界">
          <p>公民钱包是离线冷钱包，不声明网络权限，不向运营方服务器上传助记词、私钥、账户资料、签名请求或签名结果。</p>
          <p>助记词和主种子经加密后保存在设备安全存储中；访问根机密和执行签名必须通过设备生物识别验证，不回退设备密码。</p>
          <p>摄像头和照片权限仅用于扫描或读取用户选择的二维码；二维码解析和签名在本机完成。</p>
        </PrivacySection>

        <PrivacySection title="四、处理目的与法律依据">
          <p>数据仅用于提供账户、身份、发布、订阅、聊天、通知、安全防护、交易确认和用户主动请求的功能，以及履行适用的法律义务。</p>
          <p>我们不出售个人数据，不将数据用于跨 App 广告跟踪，也不使用聊天明文建立用户画像。</p>
        </PrivacySection>

        <PrivacySection title="五、保存期限与删除">
          <p>Cloudflare 服务保存账户投影、公开资料和公开内容等提供服务所需的数据；临时聊天密文和中转附件按产品设定的短期时限清理。</p>
          <p>用户可以在产品允许的范围内修改或删除资料。链上已经最终确认的公开记录依区块链协议保存，不适用普通数据库的直接删除方式。</p>
          <p>公民钱包的数据由用户控制并保存在设备本地；删除 App、本地钱包或设备数据可能导致其不可恢复，用户应自行安全备份助记词。</p>
        </PrivacySection>

        <PrivacySection title="六、公民账号和数据删除步骤">
          <p>公民用户无需向运营方发送邮件或提供助记词即可发起删除：打开公民，进入当前 CID 的本人资料页，点击右上角三点菜单，选择“注销用户”，阅读不可恢复提示后点击“确认注销”，并使用当前绑定钱包完成生物识别签名。</p>
          <p>注销成功后，服务端立即硬删除该 CID 在 Cloudflare 中可清除的账户投影、公开资料、公开内容、订阅镜像、会话、设备登记、聊天投递材料和媒体对象；当前设备同时清理该 CID 的本地业务副本。该删除没有冷静期，不能恢复。</p>
          <p>公民链上已经最终确认的 CID 注册、绑定、交易、发布或治理记录属于公开且不可由运营方单方面改写的区块链记录，因此不会随 Cloudflare 账号删除而消失。依法必须保留的安全与审计记录仅按适用法律要求保存，不用于继续提供已注销账号服务。</p>
          <p>用户也可在注销账号前，通过应用内相应资料或内容入口删除可单独删除的数据；公民钱包没有运营方账号，其助记词、私钥和签名数据始终只在用户设备中，用户可通过删除本地钱包或 App 数据清除。</p>
        </PrivacySection>

        <PrivacySection title="七、权限与安全">
          <p>公民可能请求摄像头、相册、麦克风、通知和生物识别权限，仅在相应功能需要时使用。公民钱包仅请求扫码、读取二维码和生物识别所需权限。</p>
          <p>我们采用传输加密、端到端加密、设备安全存储、签名鉴权和最小权限设计保护数据，但用户仍应妥善保护设备、助记词和恢复资料。</p>
        </PrivacySection>

        <PrivacySection title="八、政策变更">
          <p>如果数据处理方式发生实质变化，我们会更新本页面、生效日期和 App Store 隐私披露；重大变化将在适用情况下向用户作出明确通知。</p>
        </PrivacySection>
      </div>
    </div>
  )
}
