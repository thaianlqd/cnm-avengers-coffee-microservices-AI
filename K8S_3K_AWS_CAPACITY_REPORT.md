# AWS 3K capacity qualification — RESUMED, 14/10/2026

**3K NOT QUALIFIED. Phase đã resume; historical pause/cleanup bên dưới được giữ nguyên.**
Maximum stable VU chưa được xác lập. Một normal250run FAIL latency; không chạy500+
hoặc3000normal/longqualifications. [Bàn giao và bước tiếp tục](FEATURES_K8S_RESUME.md).

## Objective / reason for AWS

Qualify3000syntheticpublic-browse VUs bằng private AWS data path, loại Mac/homeinternet/
Quick Tunnel khỏi data plane. Historical200localPASS/Quick Tunnel200in-flight bottleneck
và prior3Ksetupabort được preserve trong các report cũ; không phải app ceiling.

## Source / branch / topology

Branch features_k8s, isolated siblingworktree; baseline/initialHEAD
`9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b` từ freshlyfetchedorigin/main.
Application images cho các load runs: `b9ba9fd95c3f63f3a9356b27454710a752bfc49b`.
[Source manifest](k8s/verification/3k-aws-capacity/source-baseline.json).

Profileavengers-k6, ap-southeast-2, defaultVPC/subnetap-southeast-2a giữ nguyên.
3targetm7i-flex.large (server+2agents), 1generator cùngtype, mỗi máy2vCPU/8GiB/x86_64.
Ubuntu24.04.5, kernel7.0.0-1014-aws, k3s/kubectlv1.34.1+k3s1,
containerdv2.1.4-k3s2. Nativek6v2.3.0 checksumofficialverified.
Target SG onlyclusterTCP6443/10250, UDP8472, imageTCP8050 fromtargetSG;
NodePort 30300 fromgeneratorSG only. NoSSH/publicapplicationport/EIP/NAT/LB.
HTTPSQuick Tunnel dùng encryptedcontrol ONLY; mọi k6/curlbenchmarkdata đi privateIPv4.

## Images / service scope / read-only

Fiveamd64immutableimages: Gateway/Identity/Menu/News/customer-media, privateVPCtar
transfer andSHAchecks, importedonall nodes. [Image digests/IDs/DockerfileSHA/tarSHA](k8s/verification/3k-aws-capacity/3k-aws-20261014T083654Z-d7120e/attempt2/images.json).
NoOrder/payment/provider/AIworkers, MacRedis/RabbitMQ or mockbackend indata path.
ExistingSupabase/PostgreSQL only. K8S_DB_MODE=existing, K8S_DEMO_READ_ONLY=true.
Audit: Menu skipstartupmigration, News skipseed/viewwrite, Identity skipmembershipdefaultwrites;
synchronizefalse. Flag is notSQLpermission-levelwriteblock. Load/diagnostic SQL wereGET/SELECTonly.
MinimalDBsecrets encryptedCMS; productionJWT/email/paymentsecrets excluded,
temporaryJWT/internal/providerdisabledvalues used forrequiredstartupconfig.
Targetprivatekeys stayed onEC2; publiccertfingerprints verified viaAWSconsole.
Noenv/credential/privatekey committed or passedtoDockerbuild.

## Workload / thresholds / private baseline

FourGET sequential: /menu/danh-muc, /menu/san-pham, /users/branches/public,
/news?limit=100; think3s, JSON+gzip, parse/validateeveryitem; body retained.
FrozenSHA256dfb9af16b94cc0b22ae53710ece3bde446831fb110a928e7573120bf3ffc4c83.
Failure<2%, checks>98%, wholep95<1500ms AND holdp95<1500ms,
nooverloadrestart/OOM/CrashLoop/pressure, validHPA/generator, smoke+naturalrecovery.

After readinessfix: all nodes/podsReady, restarts0, topnodes/pods/HPAmetricsPASS.
Generator20 requests per route=80/80HTTP 200, gzip/fullJSONPASS.
Routebaselinep95category76ms/products186ms/branches129ms/news65ms.
Coldmax1261/3606/2446/1200ms respectively, preserved ratherthanhidden.
Payloadcategory23/products118/branches1215/news3; branches80793gzipbytes.
[Baseline](k8s/verification/3k-aws-capacity/3k-aws-20261014T083654Z-d7120e/attempt2/network-baseline.json).

## Load ladder / first failure / thesis table

| VU | Target | Generator | Requests | RPS | Failure% | Checks% | p95ms | Holdp95ms | p99ms | Gateway | Identity | Menu | NodeCPUpeak | GenCPUpeak | Restartdelta | Result |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
|250|3|1|19856|94.11|0|100|3536.66|3758.64|4132.33|4|2|2|19%|59.9%|0|FAIL latency|
|500–3000|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|NOT RUN|

[Run analysis](k8s/verification/3k-aws-capacity/3k-aws-20261014T083654Z-d7120e/attempt2/ladder-250/analysis.json).
Generatorvalid: hold24/24samples, maxgap5.02s, RAMmin6441328KiB,
FDpeak255/soft1024, CPUstreak>=90%=0, ENAallowanceincrements0.
Targethold24/24samples, restartdelta0, noOOM/CrashLoop/nodepressure/invalidHPA.
BriefPendingsamples duringscale-up recorded; no sustainedschedulingpressure observed.
Postsmoke andnaturalrecovery toG/I/M2/1/1PASS. Ladderstoppedbefore500.
Branchholdp95~4167ms, product~1939ms; connection/receivingtails alsoobserved.
Noevidence supports addingtargetnodes, raisingHPA/limits/cacheTTL or claimingSupabasehardceiling.

Diagnostic250 withlow-ratecurl/podGETs isNOTqualification: curlbranchp95~2541ms,
k6holdp95~3783ms. NodeENAallowance/listenoverflow/timeoutcounters0;
GETpodloopback showedwarmbranchresponses9–98ms vs cold2472ms.
These distinguishcachedresponses/freshDBcost, butrootcause attributionremainsincomplete.

## Tuning experiments / before-after

| Hypothesis/evidence | Change | Before | After | Decision |
|---|---|---|---|---|
|FreshDBconnect1007–1149ms exceededreadinessconnect1000|BoundedDB_PROBE_CONNECTION_TIMEOUT_MS; default 1000, AWS2000; query 1000/probe 4s unchanged|3backendsunready/503|AllReady,0restarts,metricsvalid|Keep; testsPASS|
|Poolidle5000 closesconnections betweenrefreshes|IsolatedSELECT1diagnostic only: pool5000vs30000,7sidle|max3queries1211/1269/1278ms, connections0beforeeach|cold1356ms, warm194/194ms, connectionretained|Hypothesispending; NOproductpooltuningimplemented|

Noactualpayload/cache/HPA/resource/keepalive tuning retained.
Initialconsoleparser bug (AWSCLIalreadydecodesconsole) causedonebootstrapabort;
fullycleanupbefore retry. Regressiontestadded; historicalabortpreserved.

## Maximum / normal3000 / long1 / long2 / decision

MaximumrepeatablystableVU: NOT ESTABLISHED. 3000normal:NOT RUN.
3000long#1:NOT RUN. 3000long#2:NOT RUN. **3KQUALIFIED:NO**.
Pausedbyuser, not a completed lowercapacityqualification or provenexternalhardceiling.

## Regression / limitations

AWSapplicationtests beforefinalimagebuild: Gateway20,Identity41,Menu26,News15=102PASS.
Localbackendtests82PASS; unchangeddefault 1000ms tested; DockerDesktop22resourcerenderPASS,
AWS14resourcerenderPASS. AWShelpers30tests (1historicalnativepathskip; newprivateguardnative
k6testpassed). Finalchecksevidence addedbefore commit. Localruntime not redeployed; final
localselfhealing/rollout/smoke notperformed atuserpause. NoSocketIOqualificationneededforscope.

SyntheticVUs, publicbrowseonly; nocheckout/payment/AI, nofullbrowserassets/rendering.
ExternalSupabase, self-managedk3s notEKS, fixedEC2fleet, nomulti-regionHAclaim.
Onlysinglegeneratorworkflowimplemented; distributedaggregationnotimplemented or claimed.

## Cost / cleanup / reproduction

Projectedhardmax7machines/3h +EBS/IPv4/transferreserve:$3.6187, <=$5.
Runtimeupperboundestimatecompute/EBS/IPv4:$0.5157 excludingunitemizedtransfer;
EBS/IPv4estimateassumptions explicitlyrecorded, notactualAWSbill/creditusage.
[Per-instance runtime/cost](k8s/verification/3k-aws-capacity/3k-aws-20261014T083654Z-d7120e/runtime-cost.json).
Noaccountupgrade/IAMchange/paidmanagedservice.

FinallycleanupterminatedallownedEC2andwaited, revoked/deletedownedSGs,
checkedEBS/keypairs; no defaultnetwork or unrelatedresource deleted.
Final09:47:43UTC: active/stoppedEC2=0,SG=0,EBS=0,keypair=0,temporaryendpoint=0.
Localcontrol18084/tunnelstopped; temporarykeys/secrets/jobsdeletedafterarchiving.
[Finalcleanup](k8s/verification/3k-aws-capacity/3k-aws-20261014T083654Z-d7120e/attempt2/final-cleanup.json).

Resumeinstructions andpendinghypothesis: [FEATURES_K8S_RESUME.md](FEATURES_K8S_RESUME.md).
Harnessneeds freshRunId, revalidatedAWSmetadata/prices andnewfleet; automatedfull
build/deploy/ladderdriver remainsunfinished. Neverapplytemplatek8s-localimages toAWS.
Do notmergemain/branch_thaian or openPR. Userhandles finalmerge/conflicts.

## Resume checkpoint — 250 VU, 3k-aws-20261014T140730Z-e7a0d2

Application image/source commit `da8ca6f74b04685f6b337630440184c70f5336bc`;
main baseline unchanged. Pool idle default5000, AWS30000, integer bounds1000–60000;
readiness2000 independent, maxpool2/cacheTTL5000/HPA/resources/workload unchanged.
App regression Identity58/Menu43/News32/Gateway20 and backend builds PASS.
K8S24, AWS harness35 (one historical skip); native private-guard test PASS.

Same topology3targets/1generator250:41600requests,195.92RPS,0%errors,100%checks,
p95 779.19/hold786.11/p99 1300.45ms; restart0/smoke/recovery PASS.
**INVALID GENERATOR**, CPUpeak98%,14consecutive>=90%samples. Not stable qualification.
Before was3536.66/3758.64ms; evidence supports retaining pool experiment,
not claiming app ceiling or upgrading VU before valid generator.

Added second m7i-flex.large only because adequacy failed. Same total250 split125+125,
synchronized starts skew0.000289s, exact quantiles over all raw numeric observations,
no averagepercentiles. 47636requests,223.64RPS,0%errors,100%checks,
p95 659.20/hold640.11/p99 1194.15ms, generatorpeaks61.46/53.61%,
restart0/HPAmetricsvalid/postsmoke/naturalrecovery PASS: **STABLE PASS once**.
Maximum repeatably stable not established yet. Next independent level500.

[Evidence](/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI-k8s/k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-g2-250/analysis.json).
Full numeric latency/check/failure/status observations compacted losslessly for merge;
originalraw hashes and sizes retained; real before/after/raw-merge equality verified.
Fleet currently active:3targets+2generators; lifecycle owns cleanup/deadline.
Final cleanup/cost and ladder decision pending; do not leave fleet overnight.
