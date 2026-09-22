import React from 'react';

export default function ReportPrintStyles() {
    return (
        <style>{`
            @media print {
                /* Global typography: Century Gothic everywhere */
                * {
                    font-family: 'Century Gothic', 'Futura PT Light', 'Didact Gothic', sans-serif !important;
                }
                
                html, body {
                    height: auto !important;
                    overflow: visible !important;
                }
                
                main,
                main * {
                    overflow: visible !important;
                    max-height: none !important;
                }

                main {
                    display: block !important;
                    height: auto !important;
                    min-height: 0 !important;
                }

                .overflow-hidden,
                [class~="overflow-hidden"] {
                    overflow: visible !important;
                }

                .flex-1,
                [class~="flex-1"] {
                    height: auto !important;
                    min-height: 0 !important;
                    max-height: none !important;
                }

                .plan-fitbox{
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                  width: 186mm !important;
                  margin: 0 auto !important;
                }

                #pdf-room-plan,
                #pdf-room-plan-dims,
                #pdf-room-plan-positions {
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                }

                .plan-fitbox > img{
                  display: block !important;
                  width: 100% !important;
                  height: auto !important;
                }

                #pdf-cover .rp22-param-card,
                #pdf-cover .rp22-seat-card {
                  min-height: 0 !important;
                  height: auto !important;
                }

                #pdf-cover .rp22-param-card-inner {
                  padding-top: 5mm !important;
                  padding-bottom: 5mm !important;
                }

                #pdf-cover .rp22-param-title {
                  margin-bottom: 1.5mm !important;
                }

                #pdf-cover .rp22-param-subtitle {
                  margin-bottom: 3mm !important;
                }

                #pdf-cover .rp22-param-divider {
                  margin: 3mm 0 !important;
                }

                #pdf-cover .rp22-param-value {
                  margin-top: 1mm !important;
                }

                #pdf-cover .rp22-cover-card {
                  padding-top: 9mm !important;
                  padding-bottom: 9mm !important;
                }

                #pdf-cover .rp22-cover-stack {
                  gap: 4mm !important;
                }

                html, body, #root, #__next {
                    background: #FFFFFF !important;
                }
                
                .min-h-screen {
                    background: #FFFFFF !important;
                    padding: 0 !important;
                }
                
                .print-root, .print-container, .print-only, section {
                    background: #FFFFFF !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                
                #pdf-room-plan, #pdf-room-plan-dims {
                    background: #FFFFFF !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                }

                #root, #__next, .min-h-screen, .screen-only, .print-only {
                    height: auto !important;
                    min-height: 0 !important;
                    overflow: visible !important;
                }

                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                @page {
                    size: A4 portrait;
                    margin: 12mm;
                }

                .print-page-break-after {
                    break-after: page;
                    page-break-after: always;
                }
                .print-page-break-before {
                    break-before: page;
                    page-break-before: always;
                }
                
                .print-avoid-break {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
                
                .print-summary .print-avoid-break {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                /* Strengthen parameter card integrity — never split a card across pages */
                .rp22-report .rp22-params-grid,
                .rp22-report [style*="grid-template-columns"] {
                    break-inside: auto;
                    page-break-inside: auto;
                    overflow: visible;
                }

                .rp22-report .rp22-card-wrap,
                .rp22-report .rp22-param-card,
                .rp22-report .rp22-seat-card,
                .rp22-report .print-avoid-break {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    -webkit-column-break-inside: avoid !important;
                    overflow: visible !important;
                }

                .rp22-report .rp22-card-wrap > * {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
                
                .print-only .rounded-xl,
                .print-only .rounded-xl * {
                    overflow: visible !important;
                    max-height: none !important;
                }

                .screen-only,
                .no-print,
                nav,
                header,
                aside,
                footer,
                .b44-sidebar,
                .b44-topbar,
                [class*="sidebar"],
                [class*="SideBar"],
                [class*="TopBar"],
                [class*="navbar"],
                [class*="NavBar"],
                [class*="toolbar"],
                [class*="ToolBar"],
                [class*="api"],
                [class*="Api"],
                #root > div > div:first-child {
                    display: none !important;
                }

                .print-only {
                    display: block !important;
                    width: 100% !important;
                }

                .print-root {
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                .print-only .card,
                .print-only .card * {
                    overflow: visible !important;
                    max-height: none !important;
                }

                /* ── Print parameter pagination: 3 cards per page ── */
                .rp22-report .rp22-params-print-groups {
                    display: block !important;
                    gap: 0 !important;
                }
                .rp22-report .rp22-param-page {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    display: flex;
                    flex-direction: column;
                    gap: 10mm;
                    box-sizing: border-box;
                    justify-content: center;
                    min-height: 311mm;
                }
                .rp22-report .rp22-param-page:first-child {
                    min-height: 294mm;
                }
                .rp22-report .rp22-param-page + .rp22-param-page {
                    break-before: page;
                    page-break-before: always;
                }

                /* Override inline min-heights to fit 3 cards per page */
                .rp22-report .rp22-param-page .rp22-card-wrap > div,
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div {
                    min-height: 0 !important;
                }

                /* Compact padding for print */
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div {
                    padding-left: 5mm !important;
                    padding-right: 5mm !important;
                }
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div:first-child {
                    padding-top: 2.5mm !important;
                    padding-bottom: 0 !important;
                }
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div:nth-child(2) {
                    padding-top: 1mm !important;
                    padding-bottom: 0 !important;
                }
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div:last-child {
                    padding-top: 0 !important;
                    padding-bottom: 2.5mm !important;
                }

                /* Reduce description font size and line height */
                .rp22-report .rp22-param-page .rp22-card-wrap > div > div:first-child > div:nth-child(2) {
                    font-size: 8.5pt !important;
                    line-height: 1.35 !important;
                }

                /* ── Technical Report redesigned parameter pages (Stage A) ── */
                .rp22-report .tech-params-print-groups {
                    display: block !important;
                    background: #F1F0EE !important;
                    padding: 0 !important;
                }

                .rp22-report .tech-param-page {
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                    min-height: 268mm !important;
                    padding: 6mm 4mm 4mm 4mm !important;
                    box-sizing: border-box !important;
                    background: #F1F0EE !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                .rp22-report .tech-param-page--first {
                    min-height: 250mm !important;
                }

                /* Stage B — Technical Report overview & summary pages */
                .rp22-report .tech-overview-page,
                .rp22-report .tech-summary-page {
                    background: #F1F0EE !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                .rp22-report .tech-param-page:not(:last-child) {
                    break-after: page;
                    page-break-after: always;
                }

                .rp22-report .tech-param-card {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* Keep the ASDR scorecard and all recommendation cards on one print page
                   for the standard active-parameter set. If a larger scorecard must flow,
                   it may break only between complete category groups. */
                .rp22-report .tech-asdr-scorecard {
                    padding: 6mm 10mm 3mm 10mm !important;
                }

                .rp22-report .tech-asdr-scorecard-heading {
                    margin-bottom: 3mm !important;
                }

                .rp22-report .tech-asdr-categories {
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }

                .rp22-report .tech-asdr-category-section {
                    margin-bottom: 3mm !important;
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                .rp22-report .tech-asdr-seating-summary {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                .rp22-report .tech-asdr-recommendations {
                    margin-top: 2mm !important;
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                .rp22-report .tech-asdr-recommendation-card {
                    padding: 3mm 4mm !important;
                }

                .rp22-report .tech-param-page,
                .rp22-report .tech-param-page * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* ── Technical Report seat-result pills: 2× size in print/PDF only ──
                   Affects only the per-seat L1–L4 / FAIL badges (TechnicalLevelBadge
                   size="small") inside the Technical Report. Web UI, Room Designer,
                   compliance panel and category-summary pills are unchanged. */
                .rp22-report .tech-seat-badge {
                    width: 52px !important;
                    height: 36px !important;
                    min-width: 52px !important;
                    font-size: 16pt !important;
                    border-radius: 6px !important;
                }
            }

            @media screen {
                .print-only { display: none !important; }
            }

            .screen-only { display: block; }

            .print-root {
                background: #FFFFFF;
            }

            .print-container {
                width: 100%;
                max-width: 100%;
                margin: 0;
                padding: 0;
                font-family: 'Didact Gothic', 'Century Gothic', sans-serif;
            }

            .rp22-report .rp22-params-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10mm;
                align-items: start;
            }

            @media print {
                html, body {
                    height: auto !important;
                    overflow: visible !important;
                }

                .rp22-report,
                .rp22-report * {
                    overflow: visible !important;
                    max-height: none !important;
                }

                .rp22-report,
                .rp22-report .print-summary,
                .rp22-report .print-root,
                .rp22-report .print-pages,
                .rp22-report [class*="scroll"],
                .rp22-report [class*="Scroll"],
                .rp22-report [class*="container"],
                .rp22-report [class*="Container"] {
                    height: auto !important;
                    min-height: 0 !important;
                    max-height: none !important;
                    overflow: visible !important;
                    position: static !important;
                }

                .rp22-report .rp22-params-grid {
                    grid-template-columns: 1fr !important;
                    break-inside: auto;
                    page-break-inside: auto;
                }

                .rp22-report {
                    padding-bottom: 12mm;
                }

                .rp22-report .rp22-seat-card,
                .rp22-report .rp22-param-card {
                    height: auto !important;
                    min-height: 0 !important;
                    max-height: none !important;
                }

                .rp22-report .rp22-seat-card *,
                .rp22-report .rp22-param-card * {
                    max-height: none !important;
                }

                .rp22-report .card-content,
                .rp22-report .CardContent,
                .rp22-report [class*="CardContent"] {
                    height: auto !important;
                    min-height: 0 !important;
                }

                .rp22-report .rp22-cards-grid {
                    display: grid !important;
                    grid-template-columns: 1fr 1fr !important;
                    gap: 7mm 7mm !important;
                    align-items: start !important;
                    align-content: start !important;
                    grid-auto-rows: auto !important;
                }

                .rp22-report .rp22-card-wrap {
                    display: block !important;
                    width: 100% !important;
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    -webkit-column-break-inside: avoid !important;
                }

                .rp22-report .rp22-param-card,
                .rp22-report .rp22-seat-card {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    -webkit-column-break-inside: avoid !important;
                }

                .rp22-report .rp22-break-avoid {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                .rp22-report .rp22-break-ok {
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }
            }

            .break-inside-avoid-page,
            .page-break-inside-avoid {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }

            @media print {
                .break-inside-avoid-page,
                .page-break-inside-avoid {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }

                .report-counts-dashboard {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
            }

            .rp22-report .rp22-param-card {
                border: 1.5px solid #D9D5CE;
                border-radius: 10px;
                background: #FFFFFF;
                box-shadow: none;
                overflow: visible;
                break-inside: avoid;
                page-break-inside: avoid;
                position: relative;
                display: flex;
                flex-direction: column;
            }

            .rp22-report .rp22-param-card-inner {
                padding: 5mm 7mm;
                flex: 1;
                display: flex;
                flex-direction: column;
            }

            .rp22-report .rp22-param-title {
                font-size: 11.5pt;
                font-weight: 700;
                line-height: 1.25;
                margin: 0 0 1.5mm 0;
                color: #1B1A1A;
            }

            .rp22-report .rp22-param-subtitle {
                font-size: 9pt;
                color: #3E4349;
                margin: 0 0 3mm 0;
                line-height: 1.4;
            }

            .rp22-report .rp22-param-divider {
                height: 1px;
                background: #EEEAE3;
                margin: 3mm 0;
            }

            .rp22-report .rp22-level-pill {
                position: absolute;
                right: 7mm;
                bottom: 7mm;
            }

            .rp22-report .rp22-param-content {
                flex: 1;
                font-size: 9.5pt;
                color: #3E4349;
                line-height: 1.5;
            }

            .rp22-report .rp22-param-value {
                font-size: 11pt;
                font-weight: 700;
                color: #1B1A1A;
                margin-top: 1mm;
            }

            @media print {
              /* ── Canonical block pagination contract ──────────────────────
                 A4 portrait with 12 mm page margins leaves 273 mm of usable
                 height. Every major report block is measured by
                 useReportBlockPagination before print and is kept atomic. */
              .rp22-report {
                padding-bottom: 0 !important;
              }

              .rp22-report .report-page-block {
                box-sizing: border-box !important;
                width: 100% !important;
                break-inside: avoid-page !important;
                page-break-inside: avoid !important;
                -webkit-column-break-inside: avoid !important;
                position: relative !important;
              }

              .rp22-report .report-page-block[data-report-page-start="true"],
              .rp22-report .report-force-new-page {
                break-before: page !important;
                page-break-before: always !important;
              }

              .rp22-report .report-page-block--cover,
              .rp22-report .report-page-block--summary,
              .rp22-report .report-drawing-page,
              .rp22-report .tech-param-page {
                min-height: 272mm !important;
                height: 272mm !important;
                max-height: 272mm !important;
                overflow: hidden !important;
              }

              .rp22-report .report-drawing-page {
                display: flex !important;
                flex-direction: column !important;
                justify-content: flex-start !important;
              }

              .rp22-report .plan-fitbox {
                width: 186mm !important;
                height: 272mm !important;
                max-height: 272mm !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
              }

              /* A fixed available rectangle plus object-fit: contain implements
                 scale = min(availableWidth / drawingWidth,
                             availableHeight / drawingHeight).
                 Both dimensions are constrained so browser print layout cannot
                 restore the image's intrinsic height and crop the room. */
              .rp22-report .plan-fitbox > img {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                margin: auto !important;
                object-fit: contain !important;
                object-position: center center !important;
              }

              .rp22-report .speaker-position-plan {
                width: 100% !important;
                height: 100% !important;
                max-height: 100% !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
              }

              .rp22-report .speaker-position-plan__drawing {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                max-height: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
              }

              .rp22-report .speaker-position-plan__image {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                margin: auto !important;
                object-fit: contain !important;
                object-position: center center !important;
              }

              .rp22-report .report-drawing-title {
                flex: 0 0 auto !important;
                font-family: 'Century Gothic', 'Futura PT Light', sans-serif !important;
                font-size: 18pt !important;
                font-weight: 700 !important;
                color: #1B1A1A !important;
                line-height: 1.1 !important;
                margin: 0 0 6mm 0 !important;
              }

              .rp22-report .report-drawing-frame {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                max-height: 240mm !important;
                overflow: hidden !important;
                break-inside: avoid-page !important;
                page-break-inside: avoid !important;
              }

              .rp22-report .report-drawing-frame > * {
                max-height: 240mm !important;
                overflow: hidden !important;
              }

              .rp22-report .report-drawing-frame svg {
                display: block !important;
                width: 100% !important;
                height: auto !important;
                max-height: 232mm !important;
                object-fit: contain !important;
              }

              .rp22-report #pdf-sightlines > .print-avoid-break,
              .rp22-report #pdf-screen-wall-construction > .print-avoid-break {
                width: 100% !important;
                max-height: 257mm !important;
                overflow: hidden !important;
              }

              .rp22-report #pdf-screen-wall-construction > .print-avoid-break {
                height: 272mm !important;
                max-height: 272mm !important;
              }

              .rp22-report #pdf-screen-wall-construction svg {
                display: block !important;
                width: auto !important;
                max-width: 100% !important;
                height: 272mm !important;
                max-height: 272mm !important;
                margin: 0 auto !important;
                object-fit: contain !important;
              }

              .rp22-report .tech-param-report-heading {
                flex: 0 0 auto !important;
                margin: 0 0 1mm 0 !important;
              }

              .rp22-report .tech-param-report-title {
                font-family: 'Century Gothic', 'Futura PT Light', sans-serif !important;
                font-size: 16pt !important;
                font-weight: 400 !important;
                color: #213428 !important;
                line-height: 1.1 !important;
                letter-spacing: 0.01em !important;
              }

              .rp22-report .tech-param-report-subtitle {
                margin-top: 1mm !important;
                color: #625143 !important;
                font-size: 8pt !important;
                letter-spacing: 0.08em !important;
                text-transform: uppercase !important;
              }

              .rp22-report .tech-param-page,
              .rp22-report .tech-param-page--first {
                padding: 6mm 4mm 4mm 4mm !important;
                break-inside: avoid-page !important;
                page-break-inside: avoid !important;
              }

              /* Oversize is diagnostic only; the fixed page owners above keep
                 every supported drawing and card group inside one page. */
              .rp22-report [data-report-block-oversize="true"] {
                outline: none !important;
              }

              #pdf-cover,
              #pdf-room-parameters,
              #pdf-seat-parameters,
              #pdf-room-plan,
              #pdf-room-plan-dims,
              #pdf-room-plan-positions {
                zoom: 1 !important;
              }
            }

            @media print {
              .rp22-report .rp22-card-wrap,
              .rp22-report .print-avoid-break {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              .rp22-report .rp22-param-card,
              .rp22-report .rp22-seat-card {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              .rp22-report .rp22-param-card,
              .rp22-report .rp22-seat-card,
              .rp22-report .rp22-param-card *,
              .rp22-report .rp22-seat-card * {
                overflow: visible !important;
                max-height: none !important;
              }
            }
        `}</style>
    );
}