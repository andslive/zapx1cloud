/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface PlatformGenericProps {
  __subject?: string
  __html?: string
  __preview?: string
}

const PlatformGenericEmail = ({
  __subject = 'Notificação',
  __html = '<p>Sem conteúdo.</p>',
  __preview,
}: PlatformGenericProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{__preview ?? __subject}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div dangerouslySetInnerHTML={{ __html }} />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PlatformGenericEmail,
  subject: (data: Record<string, any>) => data.__subject || 'Notificação',
  displayName: 'Template genérico (HTML do painel)',
  previewData: {
    __subject: 'Pré-visualização',
    __html: '<h1>Olá!</h1><p>Este é um email da plataforma.</p>',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0 }
const container = { padding: '24px 28px', maxWidth: '600px', margin: '0 auto' }
