import { useState } from 'react'
import { DialRoot } from 'dialkit'
import App from './App'
import InternetDesign from './internet-design/InternetDesign'

const path = window.location.pathname.replace(/\/+$/, '')
const isInternetDesign = path === '/internet-design' || path === '/internet-design/v2'
const version = path === '/internet-design/v2' ? 2 : 1

export default function Workspace() {
  const [dialOpen, setDialOpen] = useState(false)
  return (
    <>
      {isInternetDesign ? <InternetDesign version={version} dialOpen={dialOpen} /> : <App />}
      {isInternetDesign && <DialRoot position="bottom-right" theme="dark" defaultOpen={false} productionEnabled onOpenChange={setDialOpen} />}
    </>
  )
}
