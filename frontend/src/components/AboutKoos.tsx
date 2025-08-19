import { useState } from 'react'

type KoosPageSections = 'intro' | 'whyKoos' | 'whatKoosDoes' | 'whoKoosHelps' | 'behindKoos' | 'futureKoos'

interface KoosRole {
  role: string
  example: string
  icon: string
}

function AboutKoos() {
  const [activeSection, setActiveSection] = useState<KoosPageSections>('intro')

  const koosRoles: KoosRole[] = [
    {
      role: 'Budget Nudging',
      example: "You've got R200 left in 'Food' this month. Maybe skip the energy drink?",
      icon: '💰'
    },
    {
      role: 'Encouragement',
      example: "You've stayed on budget 3 weeks straight. I'm proud of you, boet.",
      icon: '🎉'
    },
    {
      role: 'Alerts',
      example: "Your sponsor just topped up R500 — time to eat!",
      icon: '🔔'
    },
    {
      role: 'Spend Insights',
      example: "You're spending more on airtime than transport — want to adjust?",
      icon: '📊'
    },
    {
      role: 'Merchant Guidance',
      example: "Congrats on 20 transactions this week, chief.",
      icon: '🏪'
    }
  ]

  const renderIntroSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <div className="text-center mb-8">
          <div className="text-8xl mb-4">🦌</div>
          <h1 className="text-4xl font-bold text-kudu-brown mb-4">Meet Koos the Kudu</h1>
          <p className="text-xl text-charcoal-light mb-6">Your lekker financial chommie</p>
        </div>
        
        <div className="bg-savanna-gold-light rounded-lg p-6 border-l-4 border-savanna-gold">
          <blockquote className="text-lg italic text-charcoal mb-4">
            "Howzit! I'm Koos the Kudu — your lekker financial chommie.
            I help students stay on budget, sponsors rest easy, and merchants get paid.
            And I do it all with style, charm, and no-nonsense vibes."
          </blockquote>
          <cite className="text-kudu-brown font-semibold">— Koos the Kudu 🦌</cite>
        </div>
        
        <div className="mt-8 text-center">
          <div className="inline-block bg-kalahari-sand rounded-lg p-4">
            <p className="text-sm text-charcoal-light">
              Image: mascot on phone, chill pose with speech bubble
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderWhyKoosSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">🧠 Why a Kudu?</h2>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">🌍</span>
              <div>
                <h3 className="font-semibold text-charcoal">Indigenous & Iconic</h3>
                <p className="text-charcoal-light">African animal with deep cultural roots</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-2xl">💪</span>
              <div>
                <h3 className="font-semibold text-charcoal">Strong & Fast</h3>
                <p className="text-charcoal-light">Graceful — like the KuduPay system</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-2xl">🇿🇦</span>
              <div>
                <h3 className="font-semibold text-charcoal">Cultural Relevance</h3>
                <p className="text-charcoal-light">"Lekker" and local vibes</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-2xl">🧠</span>
              <div>
                <h3 className="font-semibold text-charcoal">Memorable</h3>
                <p className="text-charcoal-light">Easy to remember and brand</p>
              </div>
            </div>
          </div>
          
          <div className="bg-acacia-green-light rounded-lg p-6 flex items-center justify-center">
            <blockquote className="text-center">
              <p className="text-xl italic text-white mb-2">
                "We didn't want a bank. We wanted a buddy."
              </p>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  )

  const renderWhatKoosDoesSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">🤖 What Koos Does</h2>
        <p className="text-center text-charcoal-light mb-8">Koos plays many practical roles in your financial journey</p>
        
        <div className="space-y-6">
          {koosRoles.map((role, index) => (
            <div key={index} className="bg-kalahari-sand rounded-lg p-6 border border-kalahari-sand-dark">
              <div className="flex items-start space-x-4">
                <span className="text-3xl">{role.icon}</span>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-kudu-brown mb-2">{role.role}</h3>
                  <div className="bg-white rounded-lg p-4 border-l-4 border-savanna-gold">
                    <p className="italic text-charcoal">"{role.example}"</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderWhoKoosHelpsSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">🧑‍🤝‍🧑 Who Koos Helps</h2>
        
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-sky-blue-light rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">🧑‍🎓</div>
            <h3 className="text-xl font-semibold text-kudu-brown mb-3">Students</h3>
            <ul className="text-charcoal-light space-y-1">
              <li>• Nudges</li>
              <li>• Budgeting help</li>
              <li>• Balance updates</li>
            </ul>
          </div>
          
          <div className="bg-sunset-orange-light rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">🧑‍🏫</div>
            <h3 className="text-xl font-semibold text-kudu-brown mb-3">Sponsors</h3>
            <ul className="text-charcoal-light space-y-1">
              <li>• Notifications</li>
              <li>• Usage summaries</li>
              <li>• Red flag alerts</li>
            </ul>
          </div>
          
          <div className="bg-acacia-green-light rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">🧑‍💼</div>
            <h3 className="text-xl font-semibold text-white mb-3">Merchants</h3>
            <ul className="text-white space-y-1">
              <li>• Payment confirmations</li>
              <li>• Reminders</li>
              <li>• Feedback</li>
            </ul>
          </div>
        </div>
        
        <div className="bg-savanna-gold-light rounded-lg p-6 text-center">
          <p className="text-lg italic text-charcoal">
            Koos is the glue that keeps everyone talking (nicely) to each other.
          </p>
        </div>
      </div>
    </div>
  )

  const renderBehindKoosSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">🔧 Behind Koos</h2>
        <p className="text-center text-charcoal-light mb-8">How Koos works under the hood</p>
        
        <div className="space-y-6">
          <div className="bg-kalahari-sand rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">⚙️</span>
              <h3 className="text-xl font-semibold text-kudu-brown">Current System</h3>
            </div>
            <p className="text-charcoal-light">
              Rules-based logic powered by FastAPI triggers and frontend messages
            </p>
          </div>
          
          <div className="bg-sky-blue-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🤖</span>
              <h3 className="text-xl font-semibold text-kudu-brown">Phase 2</h3>
            </div>
            <p className="text-charcoal-light">
              Optional GPT-powered feedback engine based on student wallet patterns
            </p>
          </div>
          
          <div className="bg-sunset-orange-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">📊</span>
              <h3 className="text-xl font-semibold text-kudu-brown">Smart Logic</h3>
            </div>
            <p className="text-charcoal-light">
              Uses metadata from QR transactions and category limits to guide tone and content
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderFutureKoosSection = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-8 mb-8">
        <h2 className="text-3xl font-bold text-kudu-brown mb-6 text-center">🚀 Future Koos</h2>
        <p className="text-center text-charcoal-light mb-8">What's coming next for your financial chommie</p>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-acacia-green-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🎯</span>
              <h3 className="text-lg font-semibold text-kudu-brown">Personalized Advice</h3>
            </div>
            <p className="text-charcoal-light">Custom budgeting recommendations based on your spending patterns</p>
          </div>
          
          <div className="bg-sky-blue-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🔄</span>
              <h3 className="text-lg font-semibold text-kudu-brown">AI Feedback Loop</h3>
            </div>
            <p className="text-charcoal-light">Smart sponsor feedback system powered by AI insights</p>
          </div>
          
          <div className="bg-sunset-orange-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🎮</span>
              <h3 className="text-lg font-semibold text-kudu-brown">Gamified XP System</h3>
            </div>
            <p className="text-charcoal-light">Earn badges like "Budget Baller" and "Smart Spender"</p>
          </div>
          
          <div className="bg-savanna-gold-light rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">🛍️</span>
              <h3 className="text-lg font-semibold text-kudu-brown">Merch Shop</h3>
            </div>
            <p className="text-charcoal-light">Koos shirts, mugs, QR signs, and more swag</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'intro':
        return renderIntroSection()
      case 'whyKoos':
        return renderWhyKoosSection()
      case 'whatKoosDoes':
        return renderWhatKoosDoesSection()
      case 'whoKoosHelps':
        return renderWhoKoosHelpsSection()
      case 'behindKoos':
        return renderBehindKoosSection()
      case 'futureKoos':
        return renderFutureKoosSection()
      default:
        return renderIntroSection()
    }
  }

  return (
    <div className="min-h-screen bg-kalahari-sand-light py-8">
      <div className="container mx-auto px-4">
        {/* Navigation Tabs */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-2">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'intro', label: '👋 Meet Koos', icon: '🦌' },
                { key: 'whyKoos', label: 'Why Kudu?', icon: '🧠' },
                { key: 'whatKoosDoes', label: 'What He Does', icon: '🤖' },
                { key: 'whoKoosHelps', label: 'Who He Helps', icon: '🧑‍🤝‍🧑' },
                { key: 'behindKoos', label: 'How It Works', icon: '🔧' },
                { key: 'futureKoos', label: 'What\'s Next', icon: '🚀' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key as KoosPageSections)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    activeSection === tab.key
                      ? 'bg-kudu-brown text-white shadow-sm'
                      : 'text-charcoal hover:bg-kalahari-sand'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {renderSection()}

        {/* Design Notes */}
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-kalahari-sand-dark p-6">
            <h3 className="text-lg font-semibold text-kudu-brown mb-4">🎨 Design Notes</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-charcoal-light">
              <div>
                <p>• Warm colors, soft edges, speech bubbles</p>
                <p>• Large Koos illustrations (eyes move? blinking?)</p>
              </div>
              <div>
                <p>• Font: Friendly, soft, mobile-readable</p>
                <p>• Optional voice playback (text-to-speech)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutKoos