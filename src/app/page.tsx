import { Closing, LandingFooter } from "@/components/landing/closing"
import { Hero, LandingNav } from "@/components/landing/hero"
import { LandingMotion } from "@/components/landing/landing-motion"
import { Lifecycle } from "@/components/landing/lifecycle"
import { Paperwork } from "@/components/landing/paperwork"
import { Safeguards } from "@/components/landing/safeguards"

/* Hallmark · macrostructure: product performs (taste: product-performs,
 * seed 1327972034) · tone: plain, calm, trustworthy · anchor hue: PayPal blue
 * theme: brand (PayPal blues on white) · type: Schibsted Grotesk
 * nav: wordmark + three links + sign in · footer: tiled board
 */
export default function HomePage() {
  return (
    <LandingMotion>
      <LandingNav />
      <main>
        <Hero />
        <Lifecycle />
        <Paperwork />
        <Safeguards />
        <Closing />
      </main>
      <LandingFooter />
    </LandingMotion>
  )
}
