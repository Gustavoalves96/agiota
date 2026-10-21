import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export async function enviaEmail(para: string, assunto: string, html: string) {
  const info = await transporter.sendMail({
    from: '"Agiota do Bairro" <agiota@email.com>',
    to: para,
    subject: assunto,
    html
  })
  return info.messageId
}
