import { NextRequest, NextResponse } from 'next/server'

// ─── Raw PDF Certificate Generator (no external dependencies) ───
// Generates a professional-looking certificate as a PDF using raw PDF syntax

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function generateCertificatePDF(data: {
  name: string
  course: string
  date: string
  certificate_id: string
}): Buffer {
  const { name, course, date, certificate_id } = data

  // PDF dimensions: Letter landscape (792 x 612 points)
  const pageWidth = 792
  const pageHeight = 612
  const centerX = pageWidth / 2

  // Build content stream with certificate design
  const contentLines: string[] = []

  // --- Outer border (dark gray, thick) ---
  contentLines.push('0.15 0.15 0.15 RG')  // dark gray stroke
  contentLines.push('3 w')                  // 3pt line width
  contentLines.push(`30 30 ${pageWidth - 60} ${pageHeight - 60} re S`)

  // --- Inner border (lighter gray, thin) ---
  contentLines.push('0.4 0.4 0.4 RG')
  contentLines.push('1.5 w')
  contentLines.push(`42 42 ${pageWidth - 84} ${pageHeight - 84} re S`)

  // --- Decorative corner accents ---
  contentLines.push('0.2 0.2 0.2 RG')
  contentLines.push('2 w')
  // Top-left
  contentLines.push('50 552 m 50 562 l S')
  contentLines.push('50 562 m 60 562 l S')
  // Top-right
  contentLines.push(`${pageWidth - 50} 552 m ${pageWidth - 50} 562 l S`)
  contentLines.push(`${pageWidth - 50} 562 m ${pageWidth - 60} 562 l S`)
  // Bottom-left
  contentLines.push('50 60 m 50 50 l S')
  contentLines.push('50 50 m 60 50 l S')
  // Bottom-right
  contentLines.push(`${pageWidth - 50} 60 m ${pageWidth - 50} 50 l S`)
  contentLines.push(`${pageWidth - 50} 50 m ${pageWidth - 60} 50 l S`)

  // --- Decorative top line ---
  contentLines.push('0.3 0.3 0.3 RG')
  contentLines.push('1 w')
  contentLines.push(`${centerX - 180} 520 m ${centerX + 180} 520 l S`)

  // --- "CERTIFICATE" header ---
  contentLines.push('BT')
  contentLines.push('/F2 14 Tf')
  contentLines.push('0.35 0.35 0.35 rg')
  const certLabel = 'CERTIFICATE'
  const certLabelWidth = certLabel.length * 9
  contentLines.push(`${centerX - certLabelWidth / 2} 535 Td`)
  contentLines.push(`(${escapeText(certLabel)}) Tj`)
  contentLines.push('ET')

  // --- "OF COMPLETION" ---
  contentLines.push('BT')
  contentLines.push('/F2 11 Tf')
  contentLines.push('0.45 0.45 0.45 rg')
  const ofLabel = 'OF COMPLETION'
  const ofLabelWidth = ofLabel.length * 7
  contentLines.push(`${centerX - ofLabelWidth / 2} 505 Td`)
  contentLines.push(`(${escapeText(ofLabel)}) Tj`)
  contentLines.push('ET')

  // --- "This is to certify that" ---
  contentLines.push('BT')
  contentLines.push('/F1 12 Tf')
  contentLines.push('0.4 0.4 0.4 rg')
  const certifyText = 'This is to certify that'
  const certifyWidth = certifyText.length * 6
  contentLines.push(`${centerX - certifyWidth / 2} 455 Td`)
  contentLines.push(`(${escapeText(certifyText)}) Tj`)
  contentLines.push('ET')

  // --- Participant Name (large, bold) ---
  contentLines.push('BT')
  contentLines.push('/F2 28 Tf')
  contentLines.push('0.1 0.1 0.1 rg')
  const nameWidth = name.length * 14
  contentLines.push(`${centerX - nameWidth / 2} 410 Td`)
  contentLines.push(`(${escapeText(name)}) Tj`)
  contentLines.push('ET')

  // --- Decorative line under name ---
  contentLines.push('0.3 0.3 0.3 RG')
  contentLines.push('0.8 w')
  contentLines.push(`${centerX - 140} 400 m ${centerX + 140} 400 l S`)

  // --- "has successfully completed" ---
  contentLines.push('BT')
  contentLines.push('/F1 12 Tf')
  contentLines.push('0.4 0.4 0.4 rg')
  const completedText = 'has successfully completed the course'
  const completedWidth = completedText.length * 6
  contentLines.push(`${centerX - completedWidth / 2} 370 Td`)
  contentLines.push(`(${escapeText(completedText)}) Tj`)
  contentLines.push('ET')

  // --- Course Name (medium bold) ---
  contentLines.push('BT')
  contentLines.push('/F2 22 Tf')
  contentLines.push('0.15 0.15 0.15 rg')
  const courseWidth = course.length * 11
  contentLines.push(`${centerX - courseWidth / 2} 330 Td`)
  contentLines.push(`(${escapeText(course)}) Tj`)
  contentLines.push('ET')

  // --- Decorative line under course ---
  contentLines.push('0.5 0.5 0.5 RG')
  contentLines.push('0.5 w')
  contentLines.push(`${centerX - 100} 320 m ${centerX + 100} 320 l S`)

  // --- Date ---
  contentLines.push('BT')
  contentLines.push('/F1 11 Tf')
  contentLines.push('0.4 0.4 0.4 rg')
  const dateLabel = `Completed on: ${date}`
  const dateWidth = dateLabel.length * 6
  contentLines.push(`${centerX - dateWidth / 2} 280 Td`)
  contentLines.push(`(${escapeText(dateLabel)}) Tj`)
  contentLines.push('ET')

  // --- Signature lines ---
  // Left signature
  contentLines.push('0.3 0.3 0.3 RG')
  contentLines.push('0.8 w')
  contentLines.push('160 160 m 320 160 l S')
  contentLines.push('BT')
  contentLines.push('/F1 9 Tf')
  contentLines.push('0.45 0.45 0.45 rg')
  contentLines.push('200 145 Td')
  contentLines.push('(Authorized Signature) Tj')
  contentLines.push('ET')

  // Right signature
  contentLines.push('0.3 0.3 0.3 RG')
  contentLines.push('0.8 w')
  contentLines.push(`${pageWidth - 320} 160 m ${pageWidth - 160} 160 l S`)
  contentLines.push('BT')
  contentLines.push('/F1 9 Tf')
  contentLines.push('0.45 0.45 0.45 rg')
  contentLines.push(`${pageWidth - 280} 145 Td`)
  contentLines.push('(Program Director) Tj')
  contentLines.push('ET')

  // --- Certificate ID at bottom ---
  contentLines.push('BT')
  contentLines.push('/F3 8 Tf')
  contentLines.push('0.55 0.55 0.55 rg')
  const idLabel = `Certificate ID: ${certificate_id}`
  const idWidth = idLabel.length * 4.5
  contentLines.push(`${centerX - idWidth / 2} 80 Td`)
  contentLines.push(`(${escapeText(idLabel)}) Tj`)
  contentLines.push('ET')

  // --- "CertifyFlow" branding ---
  contentLines.push('BT')
  contentLines.push('/F2 8 Tf')
  contentLines.push('0.65 0.65 0.65 rg')
  const brandLabel = 'Powered by CertifyFlow'
  const brandWidth = brandLabel.length * 5
  contentLines.push(`${centerX - brandWidth / 2} 62 Td`)
  contentLines.push(`(${escapeText(brandLabel)}) Tj`)
  contentLines.push('ET')

  // --- Decorative bottom line ---
  contentLines.push('0.3 0.3 0.3 RG')
  contentLines.push('1 w')
  contentLines.push(`${centerX - 180} 95 m ${centerX + 180} 95 l S`)

  const contentStream = contentLines.join('\n')

  // ─── Build PDF Objects ───
  const objects: string[] = []
  let objNum = 1

  // Obj 1: Catalog
  objects.push(`${objNum} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
  objNum++

  // Obj 2: Pages
  objects.push(`${objNum} 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`)
  objNum++

  // Obj 3: Page
  objects.push(`${objNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>\nendobj`)
  objNum++

  // Obj 4: Content stream
  const streamBytes = Buffer.from(contentStream, 'utf-8')
  objects.push(`${objNum} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`)
  objNum++

  // Obj 5: Font F1 (Helvetica - regular)
  objects.push(`${objNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`)
  objNum++

  // Obj 6: Font F2 (Helvetica-Bold)
  objects.push(`${objNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`)
  objNum++

  // Obj 7: Font F3 (Courier - monospace for ID)
  objects.push(`${objNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj`)
  objNum++

  // Build the final PDF
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'))
    pdf += obj + '\n'
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8')
  pdf += `xref\n0 ${objNum}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objNum} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'utf-8')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { participants } = body

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'participants array is required' },
        { status: 400 }
      )
    }

    const certificates: Array<{
      name: string
      email: string
      course: string
      date: string
      certificate_id: string
      pdf_base64: string
      filename: string
    }> = []

    for (const p of participants) {
      const pdfBuffer = generateCertificatePDF({
        name: p.name || 'Participant',
        course: p.course || 'Course',
        date: p.date || new Date().toISOString().split('T')[0],
        certificate_id: p.certificate_id || `CERT-${Date.now()}`,
      })

      const sanitizedName = (p.name || 'certificate').replace(/[^a-zA-Z0-9]/g, '_')
      certificates.push({
        name: p.name,
        email: p.email,
        course: p.course,
        date: p.date,
        certificate_id: p.certificate_id,
        pdf_base64: pdfBuffer.toString('base64'),
        filename: `Certificate_${sanitizedName}.pdf`,
      })
    }

    return NextResponse.json({
      success: true,
      total: certificates.length,
      certificates,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'PDF generation failed'
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    )
  }
}
