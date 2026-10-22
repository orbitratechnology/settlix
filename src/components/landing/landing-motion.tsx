"use client"

import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(useGSAP, ScrollTrigger)

/**
 * The landing page's scroll layer. Content is rendered visible on the server;
 * these tweens only start from hidden once the script runs, so nothing stays
 * hidden if it doesn't. Reduced motion keeps a short fade and no travel.
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          wide: "(min-width: 1280px)",
        },
        (context) => {
          const { motion, wide } = context.conditions as {
            motion: boolean
            wide: boolean
          }

          // Each section's parts arrive in order: heading, text, fragment.
          gsap.utils
            .toArray<HTMLElement>("section", scope.current)
            .forEach((section) => {
              const parts = section.querySelectorAll("[data-reveal]")
              if (parts.length === 0) return
              gsap.from(parts, {
                autoAlpha: 0,
                y: motion ? 28 : 0,
                duration: motion ? 0.7 : 0.2,
                ease: "power3.out",
                stagger: motion ? 0.08 : 0,
                scrollTrigger: {
                  trigger: section,
                  start: "top 78%",
                  once: true,
                },
              })
            })

          // The refund's route through the four fields draws as it scrolls.
          if (wide) {
            const route = gsap.utils.toArray<SVGElement>(
              "[data-route]",
              scope.current,
            )
            if (motion) {
              gsap.fromTo(
                route,
                { scaleX: 0 },
                {
                  scaleX: 1,
                  ease: "none",
                  stagger: 0.5,
                  scrollTrigger: {
                    trigger: "[data-lifecycle]",
                    start: "top 65%",
                    end: "center 40%",
                    scrub: 0.6,
                  },
                },
              )
            }
          }

          // The hero fragment drifts up a little as the page leaves the hero.
          if (motion) {
            gsap.to("[data-hero-fragment]", {
              yPercent: -8,
              ease: "none",
              scrollTrigger: {
                trigger: "[data-hero]",
                start: "top top",
                end: "bottom top",
                scrub: true,
              },
            })
          }
        },
      )

      return () => mm.revert()
    },
    { scope },
  )

  return <div ref={scope}>{children}</div>
}
