function HomePage() {
  return (
    <div className="min-h-screen bg-kalahari-sand-light">
      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center">
          {/* Logo */}
          <div className="mb-4">
            <img
                src="/img/kudu_logo2.png"
                alt="KuduPay Logo"
                className="h-96 w-auto mx-auto"
            />
          </div>

          {/* Koos Introduction */}
          <div className="mb-8">
            <div className="inline-block bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-6 mb-6 max-w-2xl">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-kudu-brown rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-lg">🦌</span>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-lg text-charcoal font-medium mb-2">
                    Howzit! I'm <strong>Koos the Kudu</strong>, your digital chommie.
                  </p>
                  <p className="text-charcoal-light">
                    I'm here to help students manage their money without the stress. 
                    Think of me as your wise big brother who's got your back.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-5xl font-bold text-charcoal mb-6 font-accent">
            Smart Money Management
            <br />
            <span className="text-kudu-brown">Made Simple</span>
          </h1>

          <p className="text-xl text-charcoal-light mb-8 max-w-3xl mx-auto">
            KuduPay is the financial companion that helps South African students 
            stay on budget while giving sponsors peace of mind. 
            <span className="text-kudu-brown font-medium"> Lekker, hey?</span>
          </p>

          {/* Features Preview */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white border border-kalahari-sand-dark rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-acacia-green rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-white text-xl">💰</span>
              </div>
              <h3 className="text-xl font-semibold text-charcoal mb-3">Smart Budgeting</h3>
              <p className="text-charcoal-light">
                Keep track of your spending with gentle nudges from Koos. 
                No judgment, just helpful guidance.
              </p>
            </div>

            <div className="bg-white border border-kalahari-sand-dark rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-sky-blue rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-white text-xl">🛡️</span>
              </div>
              <h3 className="text-xl font-semibold text-charcoal mb-3">Sponsor Peace of Mind</h3>
              <p className="text-charcoal-light">
                Transparent spending reports that keep sponsors in the loop 
                without being invasive.
              </p>
            </div>

            <div className="bg-white border border-kalahari-sand-dark rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-savanna-gold rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-white text-xl">🏪</span>
              </div>
              <h3 className="text-xl font-semibold text-charcoal mb-3">Merchant Friendly</h3>
              <p className="text-charcoal-light">
                Simple payments for campus stores and local businesses. 
                Getting paid has never been this easy.
              </p>
            </div>
          </div>

          {/* Koos' Final Message */}
          <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-6 max-w-2xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-kudu-brown rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">🦌</span>
                </div>
              </div>
              <div className="text-left">
                <p className="text-charcoal font-medium">
                  "Sho, I know waiting is never lekker, but trust me - 
                  KuduPay is going to make your student life so much easier. 
                  Hang tight, boet!"
                </p>
                <p className="text-charcoal-light text-sm mt-2">
                  — Koos the Kudu
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-charcoal mb-4 font-accent">
              🔄 How KuduPay Works
            </h2>
            <p className="text-xl text-charcoal-light max-w-3xl mx-auto">
              A comprehensive guide to KuduPay's payment flow, where sponsors send money with boundaries, 
              students spend with freedom, and <strong className="text-kudu-brown">Koos the Kudu</strong> guides everyone along the way.
            </p>
          </div>

          {/* Overview */}
          <div className="mb-16">
            <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-8 mb-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-kudu-brown rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-2xl">🦌</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-charcoal mb-3">🎯 The Big Picture</h3>
                  <p className="text-lg text-charcoal-light">
                    KuduPay operates as a <strong>controlled spending platform</strong> where sponsors (parents, NGOs, bursaries) 
                    can send money to students with specific spending rules, while students enjoy freedom within those boundaries. 
                    The entire system is powered by blockchain technology and guided by me, your friendly financial assistant!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rest of the How It Works content would continue here... */}
        </div>
      </section>
    </div>
  )
}

export default HomePage