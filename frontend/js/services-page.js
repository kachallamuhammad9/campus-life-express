import { fetchPublicServices, serviceContactUrl, SERVICE_PLACEHOLDER } from './service-catalogue.js';

const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
};
export function serviceCard(service) {
    const card = el('article', null, 'service-card');
    const image = el('img', null, 'service-card-img'); image.src = service.image; image.alt = service.name; image.loading = 'lazy';
    image.addEventListener('error', () => { if (image.src !== SERVICE_PLACEHOLDER) image.src = SERVICE_PLACEHOLDER; });
    const body = el('div', null, 'service-card-body');
    body.append(el('span',service.subcategory,'service-meta-tag'),el('h3',service.name,'service-title'),el('div',service.providerName,'service-provider'),el('p',service.description,'service-desc'),el('p',service.campusName),el('p','Turnaround: '+service.turnaround));
    const footer = el('div',null,'service-footer');
    const contact = el('a','Contact CLX on WhatsApp','btn btn-primary'); contact.href=serviceContactUrl(service); contact.target='_blank'; contact.rel='noopener noreferrer'; contact.setAttribute('aria-label',`Contact CLX on WhatsApp about ${service.name}`);
    footer.append(el('span',service.priceLabel,'service-price-label'),contact); body.append(footer); card.append(image,body); return card;
}
export function initServicesPage(campusManager) {
    const grid=document.getElementById('services-grid');
    const search=document.getElementById('services-search');
    const category=document.getElementById('services-subcategory');
    const status=document.getElementById('services-status');
    let generation=0;
    async function render() {
        const current=++generation;
        status.textContent='Loading services…'; grid.replaceChildren();
        const result=await fetchPublicServices({campus:campusManager.selectedCampus});
        if(current!==generation)return;
        if(!result.success){status.textContent=result.error.message;return;}
        const selected=category.value;
        const options=new Map(result.data.filter(s=>s.subcategorySlug).map(s=>[s.subcategorySlug,s.subcategory]));
        category.replaceChildren(new Option('All services','all'));
        [...options].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([value,label])=>category.append(new Option(label,value)));
        category.value=options.has(selected)?selected:'all';
        const query=search.value.trim().toLowerCase();
        const data=result.data.filter(s=>(category.value==='all'||s.subcategorySlug===category.value)&&`${s.name} ${s.description} ${s.providerName} ${s.subcategory}`.toLowerCase().includes(query));
        grid.replaceChildren(...data.map(serviceCard));
        status.textContent=data.length?`${data.length} services available`:'No services match your selection.';
    }
    search.addEventListener('input',render); category.addEventListener('change',render);
    document.getElementById('services-refresh').addEventListener('click',render);
    window.addEventListener('clx:campus-changed',render); render();
}
