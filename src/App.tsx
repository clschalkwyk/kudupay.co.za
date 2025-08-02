import { useState } from 'react'

function App() {
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setIsSubmitted(true)
      // Here you would typically send the email to your backend
      console.log('Email submitted:', email)
    }
  }

  return (
    <div className="min-h-screen bg-kalahari-sand-light">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-kalahari-sand-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src="/img/kudu_logo_small.png"
                alt="KuduPay Logo" 
                className="w-10"
              />
              <h1 className="text-2xl font-bold text-kudu-brown font-accent">
                KuduPay
              </h1>
            </div>
            <div className="text-sm text-charcoal-light">
              Coming Soon
            </div>
          </div>
        </div>
      </header>

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

          {/* Coming Soon Message */}
          <div className="bg-white border border-kalahari-sand-dark rounded-xl p-8 mb-12 max-w-2xl mx-auto shadow-sm">
            <h2 className="text-3xl font-semibold text-kudu-brown mb-4">
              We're Almost Ready!
            </h2>
            <p className="text-lg text-charcoal mb-6">
              Ag sorry, we're still putting the finishing touches on KuduPay. 
              But don't worry - we're working around the clock to get this sorted for you.
            </p>
            
            {/* Email Signup */}
            {!isSubmitted ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-2">
                    Get notified when we launch
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      className="flex-1 px-4 py-3 border border-kalahari-sand-dark rounded-lg focus:ring-2 focus:ring-kudu-brown focus:border-kudu-brown transition-colors"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-kudu-brown hover:bg-kudu-brown-dark text-white font-medium px-6 py-3 rounded-lg transition-colors"
                    >
                      Notify Me
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="bg-acacia-green-light border-l-4 border-acacia-green rounded-r-lg p-4">
                <p className="text-acacia-green-dark font-medium">
                  ✅ Sorted! We'll ping you as soon as KuduPay is ready to roll.
                </p>
              </div>
            )}
          </div>

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

      {/* Footer */}
      <footer className="bg-white border-t border-kalahari-sand-dark mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <img 
                src="/img/kudu_logo.svg" 
                alt="KuduPay Logo" 
                className="h-8 w-8"
              />
              <span className="text-lg font-semibold text-kudu-brown font-accent">
                KuduPay
              </span>
            </div>
            <p className="text-charcoal-light text-sm">
              © 2025 KuduPay. Making student finances less scary, one transaction at a time.
            </p>
            <p className="text-charcoal-light text-xs mt-2">
              Built with ❤️ in South Africa
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
