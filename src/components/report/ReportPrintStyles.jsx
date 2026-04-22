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
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }
                
                .print-summary .print-avoid-break {
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
              #pdf-cover,
              #pdf-room-parameters,
              #pdf-seat-parameters {
                zoom: 0.9 !important;
              }

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