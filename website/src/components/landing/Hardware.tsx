"use client";

import Image from "next/image";

const SCENE_LABELS = [
  { label: "desk_work",      desc: "Seated at screen",          color: "bg-amber-200 text-amber-800" },
  { label: "standing_desk",  desc: "Standing, working",         color: "bg-amber-100 text-amber-700" },
  { label: "meeting",        desc: "Multi-person room",         color: "bg-blue-200 text-blue-800" },
  { label: "presenting",     desc: "Standing, presenting",      color: "bg-blue-100 text-blue-700" },
  { label: "walking",        desc: "On foot",                   color: "bg-green-200 text-green-800" },
  { label: "commuting",      desc: "In transit",                color: "bg-green-100 text-green-700" },
  { label: "exercise",       desc: "Gym / sport / workout",     color: "bg-red-200 text-red-800" },
  { label: "resting",        desc: "Sofa / lounge",             color: "bg-purple-200 text-purple-800" },
  { label: "eating",         desc: "Meal time",                 color: "bg-orange-200 text-orange-800" },
  { label: "reading",        desc: "Book or phone",             color: "bg-indigo-200 text-indigo-800" },
  { label: "social_casual",  desc: "Informal chat",             color: "bg-pink-200 text-pink-800" },
  { label: "social_dining",  desc: "Group meal",                color: "bg-pink-100 text-pink-700" },
  { label: "outdoor",        desc: "Outside environment",       color: "bg-teal-200 text-teal-800" },
  { label: "unknown",        desc: "Cannot be determined",      color: "bg-gray-200 text-gray-600" },
];

export default function Hardware() {
  return (
    <section id="hardware" className="py-32 px-6 md:px-16 lg:px-24 bg-surface">
      <div className="max-w-6xl mx-auto">
        {/* Full-width product image */}
        <div className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden mb-16">
          <Image
            src="/kinesis-product.png"
            alt="Kinesis wearable posture device on a person's back"
            fill
            className="object-cover object-center"
            priority
          />
        </div>

        {/* Text + SVG diagram */}
        <div className="grid md:grid-cols-2 gap-16 items-start">
          <div>
            <h2 className="text-5xl md:text-6xl font-extralight tracking-normal leading-tight mb-8">
              Kinesis Hardware
            </h2>
            <p className="text-lg font-light leading-relaxed tracking-wide text-muted mb-8">
              A lightweight wearable with dual IMU sensors along the spine and
              four vibration motors for directional haptic feedback.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-amber-300 border border-amber-400" />
                  <span className="text-sm font-light tracking-wide">
                    IMU x 2
                  </span>
                </div>
                <p className="text-xs font-light text-muted pl-6">
                  Upper &amp; lower spine tracking
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-purple-400" />
                  <span className="text-sm font-light tracking-wide">
                    Vibration motor x 4
                  </span>
                </div>
                <p className="text-xs font-light text-muted pl-6">
                  Directional haptic correction
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-sm font-light tracking-wide">
                    ESP32
                  </span>
                </div>
                <p className="text-xs font-light text-muted pl-6">
                  On-board processing &amp; BLE
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-blue-300" />
                  <span className="text-sm font-light tracking-wide">
                    Meta AI Glasses
                  </span>
                </div>
                <p className="text-xs font-light text-muted pl-6">
                  Context sensing &amp; voice
                </p>
              </div>
            </div>
          </div>

          {/* SVG sensor placement diagram */}
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <svg
              viewBox="0 0 400 500"
              className="w-full max-w-sm mx-auto"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Back silhouette */}
              <path
                d="M200 40 C240 40 270 60 275 90 C280 120 280 150 285 170
                   C290 190 310 200 320 220 C330 240 330 260 325 280
                   C320 300 310 320 305 340 C300 360 300 380 300 400
                   L100 400 C100 380 100 360 95 340 C90 320 80 300 75 280
                   C70 260 70 240 80 220 C90 200 110 190 115 170
                   C120 150 120 120 125 90 C130 60 160 40 200 40Z"
                fill="#f0e6d6"
                stroke="#d4c4b0"
                strokeWidth="1.5"
              />
              {/* Spine line */}
              <line x1="200" y1="80" x2="200" y2="360" stroke="#a855f7" strokeWidth="2.5" opacity="0.6" />
              {/* Shoulder line (dashed) */}
              <line x1="120" y1="190" x2="280" y2="190" stroke="#a855f7" strokeWidth="2" strokeDasharray="8 5" opacity="0.5" />
              {/* IMU sensors (yellow) */}
              <circle cx="200" cy="120" r="14" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
              <text x="200" y="125" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#92400e">IMU</text>
              <circle cx="200" cy="320" r="14" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
              <text x="200" y="325" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#92400e">IMU</text>
              {/* ESP32 chip */}
              <rect x="186" y="155" width="28" height="20" rx="3" fill="#374151" stroke="#555" strokeWidth="1" />
              <text x="200" y="168" textAnchor="middle" fontSize="6" fill="#9ca3af">ESP32</text>
              {/* Vibration motors (purple) */}
              <circle cx="200" cy="100" r="11" fill="#a855f7" opacity="0.85" />
              <text x="200" y="104" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">M</text>
              <circle cx="130" cy="190" r="11" fill="#a855f7" opacity="0.85" />
              <text x="130" y="194" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">M</text>
              <circle cx="270" cy="190" r="11" fill="#a855f7" opacity="0.85" />
              <text x="270" y="194" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">M</text>
              <circle cx="200" cy="340" r="11" fill="#a855f7" opacity="0.85" />
              <text x="200" y="344" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">M</text>
              {/* Labels */}
              <text x="240" y="122" fontSize="10" fill="#666">Upper spine</text>
              <text x="240" y="322" fontSize="10" fill="#666">Lower spine</text>
              <text x="285" y="194" fontSize="10" fill="#666">R. shoulder</text>
              <text x="60" y="194" fontSize="10" fill="#666">L. shoulder</text>
            </svg>
          </div>
        </div>

        {/* ── Context Hardware ── */}
        <div className="mt-32 grid md:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-xs font-light tracking-widest text-muted uppercase mb-4">
              powered by Xiao ESP32S3 + Claude Vision
            </p>
            <h2 className="text-5xl md:text-6xl font-extralight tracking-normal leading-tight mb-8">
              Context Hardware
            </h2>
            <p className="text-lg font-light leading-relaxed tracking-wide text-muted mb-8">
              AI glasses that understand your environment. A camera streams frames
              to Claude Vision, which classifies your scene in real time — so
              posture interventions adapt to what you&apos;re actually doing.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-sky-300 border border-sky-400" />
                  <span className="text-sm font-light tracking-wide">OV2640 Camera</span>
                </div>
                <p className="text-xs font-light text-muted pl-6">JPEG frames over USB / WiFi</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-violet-400" />
                  <span className="text-sm font-light tracking-wide">Claude Vision</span>
                </div>
                <p className="text-xs font-light text-muted pl-6">14-label scene classification</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-sm font-light tracking-wide">Xiao ESP32S3</span>
                </div>
                <p className="text-xs font-light text-muted pl-6">On-board capture &amp; streaming</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-sm font-light tracking-wide">People detection</span>
                </div>
                <p className="text-xs font-light text-muted pl-6">Social context awareness</p>
              </div>
            </div>
          </div>

          {/* Scene label grid */}
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <p className="text-xs font-light tracking-widest text-muted uppercase mb-6">
              Recognised scenes
            </p>
            <div className="flex flex-wrap gap-2">
              {SCENE_LABELS.map(({ label, desc, color }) => (
                <div key={label} className="group relative">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium tracking-wide cursor-default ${color}`}
                  >
                    {label}
                  </span>
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {desc}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-xl bg-gray-50 p-5 border border-gray-100">
              <p className="text-xs font-light tracking-widest text-muted uppercase mb-3">
                Example output
              </p>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-200 text-blue-800">
                  meeting
                </span>
                <span className="text-xs text-muted font-light">· people: yes</span>
              </div>
              <p className="text-sm font-light text-gray-600 italic">
                &ldquo;A conference room with several people seated around a table, appearing to be in discussion.&rdquo;
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
