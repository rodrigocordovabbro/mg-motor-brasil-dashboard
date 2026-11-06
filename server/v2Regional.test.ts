import {describe,it,expect} from "vitest";
import {BRAZILIAN_STATES,resolveBrazilianState,groupedStateLabel,UNIDENTIFIED_STATE} from "../shared/stateRegistry";
import {aggregateRegionalModels} from "./v2Regional";
import {aggregateV2Leads} from "./v2Leads";
import type {V2Lead} from "../shared/v2Types";
const lead=(id:number,state:string,model:string):V2Lead=>({id,state,model,date:"2026-11-03",hour:12,name:"Contato de teste",version:"Não informado",channel:"Google Ads",campaign:"Teste",dealer:"Dealer original",city:"Cidade original",crm:"Não informado"});
describe("conciliação de estados",()=>{
 it("possui 27 UFs únicas por extenso",()=>{expect(BRAZILIAN_STATES).toHaveLength(27);expect(new Set(BRAZILIAN_STATES.map(s=>s.uf)).size).toBe(27);for(const state of BRAZILIAN_STATES)expect(groupedStateLabel(state.uf)).toBe(state.name)});
 it("reúne siglas, nomes e grafias equivalentes",()=>{for(const label of ["SP","SÃO PAULO","sao paulo","São Paulo/SP","BR-SP","BRASIL /SÃO PAULO","M.G"])expect(resolveBrazilianState(label)).not.toBeNull();expect(groupedStateLabel("S.PAULO")).toBe("São Paulo");expect(groupedStateLabel("RIOGRANDE DO SUL. RS")).toBe("Rio Grande do Sul");expect(groupedStateLabel("PARANA")).toBe("Paraná")});
 it("não inventa estado para campos ausentes, cidades soltas, contatos ou múltiplos estados",()=>{for(const label of ["NONE","Não informado","Floripa","SO","São Paulo/RS","MG/SP","pessoa@example.am"])expect(groupedStateLabel(label)).toBe(UNIDENTIFIED_STATE)});
});
describe("matriz regional com a base inteira filtrada",()=>{
 const rows=[lead(1,"SP","MG 4"),lead(2,"SÃO PAULO","4"),lead(3,"RS","4 URBAN"),lead(4,"RIO GRANDE DO SUL","MG 4 Urban"),lead(5,"CE","Cyberster"),lead(6,"AM","S5"),lead(7,"DF","IM6"),lead(8,"NONE","Modelo desconhecido")];
 it("reúne modelos e estados sem perder registros",()=>{const before=JSON.stringify(rows);const r=aggregateRegionalModels(rows);expect(r.total).toBe(8);expect(r.states.filter(s=>s.label==="São Paulo")).toHaveLength(1);expect(r.states.find(s=>s.label==="São Paulo")?.counts["MG 4"]).toBe(2);expect(r.regions.find(s=>s.label==="Sul")?.counts["MG Urban"]).toBe(2);expect(r.regions.find(s=>s.label==="Centro-Oeste")?.counts["IM 6"]).toBe(1);expect(r.regions.reduce((sum,s)=>sum+s.total,0)).toBe(8);expect(r.states.reduce((sum,s)=>sum+s.total,0)).toBe(8);expect(r.unidentifiedStateCount).toBe(1);expect(r.unidentifiedModelCount).toBe(1);for(const region of r.regions)expect(Object.values(region.counts).reduce((sum,n)=>sum+n,0)).toBe(region.total);expect(JSON.stringify(rows)).toBe(before)});
 it("usa os mesmos filtros de modelo/canal/período do dashboard, não a página de registros",()=>{const r=aggregateV2Leads(rows,{dateFrom:"2026-11-01",dateTo:"2026-11-04",model:"MG Urban"},null,{name:"Teste",importedAt:"2026-11-05T12:00:00Z",mode:"authenticated-import",totalRows:8,invalidDateRows:0},new Date("2026-11-05T15:00:00Z"));expect(r.summary.total).toBe(2);expect(r.summary.states).toBe(1);expect(r.summary.topState?.label).toBe("Rio Grande do Sul");expect(r.regionalModels?.total).toBe(2);expect(r.regionalModels?.regions.find(s=>s.label==="Sul")?.counts["MG Urban"]).toBe(2)});
 it("ausência de fonte não cria volumes ou estados falsos",()=>{const r=aggregateRegionalModels([]);expect(r.total).toBe(0);expect(r.regions).toEqual([]);expect(r.states).toEqual([])});
});
