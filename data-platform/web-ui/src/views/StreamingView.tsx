import React, { useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  StreamIcon, 
  RefreshIcon, 
  EyeIcon, 
  CheckIcon 
} from '../components/Icons';
import { RealtimeEvent } from '../types';

export const StreamingView: React.FC = () => {
  const { 
    realtimeEvents, 
    fetchStreaming, 
    setInspectedEvent, 
    isLiveStreaming, 
    setIsLiveStreaming,
    showToast 
  } = usePlatformStore();

  useEffect(() => {
    fetchStreaming();
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      fetchStreaming();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStreaming, isLiveStreaming]);

  const sampleEvents: RealtimeEvent[] = realtimeEvents.length > 0 ? realtimeEvents : [
    {
      id: 962325,
      topic: 'orders-events',
      event_key: 'ORD_991823',
      event_type: 'DON_HANG_HOAN_THANH',
      payload: { order_id: '991823', branch: 'CN_Q1', amount: 125000, status: 'HOAN_THANH', items_count: 3 },
      received_at: new Date().toISOString()
    },
    {
      id: 962324,
      topic: 'order-items-events',
      event_key: 'ITEM_4421',
      event_type: 'THEM_SAN_PHAM',
      payload: { item_id: '4421', product_id: 12, name: 'Cà phê đen đá', price: 35000, qty: 2 },
      received_at: new Date(Date.now() - 5000).toISOString()
    },
    {
      id: 962323,
      topic: 'shipper-events',
      event_key: 'SHIP_882',
      event_type: 'CAP_NHAT_GPS',
      payload: { shipper_id: 'SHIP_882', lat: 10.7769, lng: 106.7009, order_id: '991820', status: 'DANG_GIAO' },
      received_at: new Date(Date.now() - 12000).toISOString()
    },
    {
      id: 962322,
      topic: 'orders-events',
      event_key: 'ORD_991822',
      event_type: 'TAO_DON_HANG',
      payload: { order_id: '991822', branch: 'CN_TUDUC', amount: 95000, payment: 'MOMO' },
      received_at: new Date(Date.now() - 25000).toISOString()
    }
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-slate-800">
            Giám sát Realtime & Kafka Streaming
          </h2>
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
            3 Topics
          </span>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              setIsLiveStreaming(!isLiveStreaming);
              showToast(isLiveStreaming ? 'Tạm dừng luồng' : 'Bật phát trực tiếp', 'info');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              isLiveStreaming
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span>{isLiveStreaming ? 'Trực tiếp (4s)' : 'Tạm dừng'}</span>
          </button>

          <button
            onClick={() => {
              fetchStreaming();
              showToast('Đã làm mới sự kiện', 'success');
            }}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm"
          >
            <RefreshIcon className="w-3.5 h-3.5 text-slate-600" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Tổng sự kiện tiếp nhận
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">962.325</div>
          <div className="text-xs text-emerald-600 font-semibold mt-1">+142 sự kiện/phút</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Tốc độ nạp Throughput
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">48.5 msg/s</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Băng thông 1.2 MB/s</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Consumer Lag
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">0 msg</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Flush chu kỳ 15s</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Chủ đề Kafka
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">3 / 3</div>
          <div className="text-xs text-emerald-600 font-semibold mt-1">7 Partitions</div>
        </div>
      </div>

      {/* Topics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { topic: 'orders-events', msgs: '450.210 msgs', rate: '24.0 msg/s', partitions: 3 },
          { topic: 'order-items-events', msgs: '382.115 msgs', rate: '18.0 msg/s', partitions: 3 },
          { topic: 'shipper-events', msgs: '130.000 msgs', rate: '6.5 msg/s', partitions: 1 },
        ].map((item, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {item.topic}
              </span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {item.partitions} Partitions
              </span>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-500">{item.msgs}</span>
              <span className="text-emerald-700 font-bold">{item.rate}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Events Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Sự kiện Realtime gần nhất
          </h3>
          <span className="text-[11px] text-slate-400">public.realtime_events</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
            <tr>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Topic</th>
              <th className="px-4 py-2.5">Key</th>
              <th className="px-4 py-2.5">Loại</th>
              <th className="px-4 py-2.5">Thời gian</th>
              <th className="px-4 py-2.5 text-right">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sampleEvents.map((ev, idx) => (
              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-2.5 font-mono font-bold text-slate-800">#{ev.id}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-700">{ev.topic}</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{ev.event_key || 'Tự sinh'}</td>
                <td className="px-4 py-2.5 font-semibold text-slate-700">{ev.event_type}</td>
                <td className="px-4 py-2.5 text-slate-400 font-mono">
                  {ev.received_at ? new Date(ev.received_at).toLocaleTimeString('vi-VN') : 'Vừa xong'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => setInspectedEvent(ev)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Xem JSON</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
