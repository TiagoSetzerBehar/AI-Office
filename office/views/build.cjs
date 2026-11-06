const fs=require("fs");
const root=process.argv[2], out=process.argv[3];
const ag=JSON.parse(fs.readFileSync(root+"/office/registry/agents.json")).agents;
const dep=JSON.parse(fs.readFileSync(root+"/office/registry/departments.json")).departments;
const dir=root+"/office/businesses/cofind/tasks";
const raw=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync(dir+"/"+f)));
const data={generated_at:new Date().toISOString(),business:"CoFind",
 reviews:raw.reduce((n,t)=>n+(t.quality_checks||[]).length,0),
 agents:ag.filter(a=>a.role!=="founder").map(a=>({id:a.id,name:a.name,role:a.role,department:a.department,status:a.status})),
 departments:dep.map(d=>({id:d.id,name:d.name,status:d.status})),
 tasks:raw.map(t=>({id:t.id,title:t.title,assignee:t.assignee,status:t.status,parent:t.parent}))};
const tpl=fs.readFileSync(root+"/office/views/office.template.html","utf8");
fs.writeFileSync(out,tpl.replace("__DATA__",JSON.stringify(data).replace(/</g,"\\u003c")));
