import {useCallback,useEffect,useMemo,useState} from 'react'
import {BarChart3,RefreshCw,TrendingUp,ShoppingBag,Wallet,Package} from 'lucide-react'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'
import {supabase} from '../lib/supabase'

type Sale={id:string;sale_number:number;branch_id:string|null;created_at:string;subtotal:number;discount:number;total:number;payment_method:string;status:string}
type Item={sale_id:string;product_id:string|null;product_name:string;quantity:number;unit_price:number;unit_cost:number;line_total:number}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const dateValue=(d:Date)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
const methods:Record<string,string>={pix:'PIX',cash:'Dinheiro',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',other:'Outro'}
export default function CompanyPOSReportsPanel({company}:{company:Company}){
 const today=new Date()
 const [start,setStart]=useState(dateValue(new Date(today.getFullYear(),today.getMonth(),1)))
 const [end,setEnd]=useState(dateValue(today))
 const [branchId,setBranchId]=useState('')
 const [branches,setBranches]=useState<CompanyBranch[]>([])
 const [sales,setSales]=useState<Sale[]>([])
 const [items,setItems]=useState<Item[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  if(!supabase)return
  if(!start||!end||start>end){setError('Informe um período válido.');return}
  setLoading(true);setError('')
  try{
   const branchResult=await listCompanyBranches(company.id);setBranches(branchResult)
   let query=supabase.from('company_pos_sales').select('id,sale_number,branch_id,created_at,subtotal,discount,total,payment_method,status').eq('company_id',company.id).gte('created_at',start+'T00:00:00').lt('created_at',end+'T23:59:59.999Z').order('created_at',{ascending:false}).limit(10000)
   if(branchId)query=query.eq('branch_id',branchId)
   const {data,error:queryError}=await query
   if(queryError)throw queryError
   const rows=(data||[]) as Sale[]
   const completed=rows.filter(s=>s.status==='completed')
   const ids=completed.map(s=>s.id)
   let lineItems:Item[]=[]
   for(let offset=0;offset<ids.length;offset+=150){
    const batch=ids.slice(offset,offset+150)
    if(!batch.length)continue
    const {data:part,error:itemError}=await supabase.from('company_pos_sale_items').select('sale_id,product_id,product_name,quantity,unit_price,unit_cost,line_total').eq('company_id',company.id).in('sale_id',batch)
    if(itemError)throw itemError
    lineItems=lineItems.concat((part||[]) as Item[])
   }
   setSales(rows);setItems(lineItems)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os relatórios do PDV.')}
  finally{setLoading(false)}
 },[company.id,start,end,branchId])
 useEffect(()=>{void load()},[load])
 const completed=sales.filter(s=>s.status==='completed')
 const cancelled=sales.filter(s=>s.status==='cancelled')
 const revenue=completed.reduce((n,s)=>n+Number(s.total),0)
 const discounts=completed.reduce((n,s)=>n+Number(s.discount),0)
 const cost=items.reduce((n,i)=>n+Number(i.unit_cost)*Number(i.quantity),0)
 const grossProfit=revenue+discounts-items.reduce((n,i)=>n+Number(i.unit_cost)*Number(i.quantity),0)-discounts
 const soldUnits=items.reduce((n,i)=>n+Number(i.quantity),0)
 const avg=completed.length?revenue/completed.length:0
 const paymentTotals=useMemo(()=>Object.entries(completed.reduce((acc,s)=>{acc[s.payment_method]=(acc[s.payment_method]||0)+Number(s.total);return acc},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]),[completed])
 const productTotals=useMemo(()=>{const map=new Map<string,{name:string;qty:number;revenue:number;profit:number}>();for(const i of items){const v=map.get(i.product_id||i.product_name)||{name:i.product_name,qty:0,revenue:0,profit:0};v.qty+=Number(i.quantity);v.revenue+=Number(i.line_total);v.profit+=Number(i.line_total)-Number(i.unit_cost)*Number(i.quantity);map.set(i.product_id||i.product_name,v)}return [...map.values()].sort((a,b)=>b.qty-a.qty).slice(0,10)},[items])
 const branchTotals=useMemo(()=>{const map=new Map<string,{name:string;total:number;count:number}>();for(const s of completed){const name=branches.find(b=>b.id===s.branch_id)?.name||(s.branch_id?'Filial':'Matriz / sem filial');const v=map.get(name)||{name,total:0,count:0};v.total+=Number(s.total);v.count++;map.set(name,v)}return [...map.values()].sort((a,b)=>b.total-a.total)},[completed,branches])
 return <section className="company-pos-reports">
  <div className="company-panel">
   <div className="company-panel-head"><div><b><BarChart3 size={17}/> Relatórios do PDV</b><small>Vendas, margens, pagamentos e desempenho por filial</small></div><button type="button" className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
   <div className="company-pos-report-filters"><label>Data inicial<input type="date" value={start} max={end||undefined} onChange={e=>setStart(e.target.value)}/></label><label>Data final<input type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label><label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Todas as unidades</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
   {error&&<div className="company-error-banner">{error}</div>}
   {loading?<p className="company-empty">Calculando relatórios...</p>:<>
    <div className="company-pos-report-cards">
     <article><span><Wallet size={16}/> Faturamento líquido</span><strong>{money(revenue)}</strong><small>{completed.length} vendas concluídas</small></article>
     <article><span><TrendingUp size={16}/> Lucro bruto estimado</span><strong>{money(grossProfit)}</strong><small>Receita menos custo dos produtos</small></article>
     <article><span><ShoppingBag size={16}/> Ticket médio</span><strong>{money(avg)}</strong><small>{cancelled.length} vendas canceladas</small></article>
     <article><span><Package size={16}/> Itens vendidos</span><strong>{soldUnits.toLocaleString('pt-BR')}</strong><small>Descontos concedidos: {money(discounts)}</small></article>
    </div>
    <div className="company-pos-report-columns">
     <div className="company-pos-report-block"><h4>Vendas por forma de pagamento</h4>{paymentTotals.length?paymentTotals.map(([method,value])=><div className="company-pos-report-row" key={method}><span>{methods[method]||method}</span><b>{money(value)}</b></div>):<p className="company-empty">Sem vendas no período.</p>}</div>
     <div className="company-pos-report-block"><h4>Desempenho por filial</h4>{branchTotals.length?branchTotals.map(b=><div className="company-pos-report-row" key={b.name}><span>{b.name}<small>{b.count} vendas</small></span><b>{money(b.total)}</b></div>):<p className="company-empty">Sem vendas no período.</p>}</div>
    </div>
    <div className="company-pos-report-block"><h4>10 produtos mais vendidos</h4>{productTotals.length?<div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>QTD.</th><th>FATURAMENTO</th><th>LUCRO BRUTO*</th></tr></thead><tbody>{productTotals.map(p=><tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{money(p.revenue)}</td><td>{money(p.profit)}</td></tr>)}</tbody></table></div>:<p className="company-empty">Sem itens vendidos no período.</p>}<small className="company-pos-report-note">* Lucro bruto por produto antes da distribuição dos descontos da venda. O lucro geral considera os descontos concedidos.</small></div>
   </>}
  </div>
 </section>
}
