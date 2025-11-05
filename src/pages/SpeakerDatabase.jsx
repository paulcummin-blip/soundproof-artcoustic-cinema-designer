
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { artcousticSpeakers } from "@/components/data/speakerData";
import { SpeakerAPI } from "@/components/net/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Database,
  Volume2,
  Layers,
  Download,
  Loader2
} from "lucide-react";

export default function SpeakerDatabasePage() {
  // UI filters
  const [selectedType, setSelectedType] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [search, setSearch] = useState('');

  // Data state
  const [serverSpeakers, setServerSpeakers] = useState(null); // null => fallback to local
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Debounce + abort
  const debounceRef = useRef();
  const abortRef = useRef();
  // Request sequence guard and last good list for sticky behavior
  const reqSeqRef = useRef(0);
  const lastGoodListRef = useRef([]);

  // Categorize static data for fallback
  const categorized = useMemo(() => ({
    bed: artcousticSpeakers.filter(s => ['main', 'center', 'surround'].includes(s.type)),
    overhead: artcousticSpeakers.filter(s => s.type === 'overhead' || s.model.toLowerCase().includes('architect')),
    subwoofer: artcousticSpeakers.filter(s => s.type === 'subwoofer')
  }), []);

  const types = [
    { key: 'bed', label: 'Bed Layer Speakers' },
    { key: 'overhead', label: 'Overhead Speakers' },
    { key: 'subwoofer', label: 'Subwoofers' }
  ];

  // Map UI type bucket to server filter (best-effort)
  const typeToServerFilter = useCallback((uiType) => {
    if (uiType === 'all') return {};
    if (uiType === 'overhead') return { type: 'overhead' };
    if (uiType === 'subwoofer') return { type: 'subwoofer' };
    // 'bed' bucket implies CSV of common bed roles; API may ignore if unsupported
    return { type: 'main,surround,center' };
  }, []);

  // Server fetch with graceful fallback
  const loadSpeakers = useCallback(async (signal) => {
    setLoading(true);
    setApiError(null);
    const myId = ++reqSeqRef.current;
    try {
      const filters = {
        ...typeToServerFilter(selectedType),
        search: (search || '').trim() || undefined,
      };
      const res = await SpeakerAPI.list("-updated_date", 200, filters, { signal });
      // Ignore stale responses
      if (reqSeqRef.current !== myId) return;

      if (res.ok) {
        const next = Array.isArray(res.data) ? res.data : [];
        // Sticky on empty: if no active search/type filters and we already have a non-empty list, keep it
        const noActiveSearch = !(search || '').trim() && selectedType === 'all';
        if (next.length === 0 && Array.isArray(lastGoodListRef.current) && lastGoodListRef.current.length > 0 && noActiveSearch) {
          // keep previous list; do not overwrite with empty
          // optionally retain previous serverSpeakers (no state change)
          // console.warn("[SpeakerDB] Empty server list ignored (sticky).");
        } else {
          setServerSpeakers(next);
          // Update last good list if we accepted data
          if (next.length > 0) lastGoodListRef.current = next;
        }
      } else {
        setServerSpeakers(null); // Force fallback to local
        setApiError(res.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      setServerSpeakers(null); // Force fallback to local
      setApiError(e?.message || "network_error");
    } finally {
      if (reqSeqRef.current === myId) setLoading(false);
    }
  }, [selectedType, search, typeToServerFilter]);

  // Debounced load on filter/search changes with abort-safety
  useEffect(() => {
    // Clear any previous debounce timeout and abort any pending fetch
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Set a new debounce timeout
    debounceRef.current = setTimeout(() => {
      loadSpeakers(ctrl.signal);
    }, 250);

    // Cleanup on unmount or re-run: clear timeout and abort fetch
    return () => {
      clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [loadSpeakers]); // Dependency array: re-run effect when loadSpeakers changes (i.e., when filters/search change)

  // Base list for model dropdown (server if available; else by category)
  const modelOptions = useMemo(() => {
    if (Array.isArray(serverSpeakers)) return serverSpeakers;
    if (selectedType === 'all') return artcousticSpeakers;
    return categorized[selectedType] || [];
  }, [serverSpeakers, selectedType, categorized]);

  // Final grid list (prefer server; then fallback local). Apply model filter client-side.
  const filteredSpeakers = useMemo(() => {
    let base = Array.isArray(serverSpeakers)
      ? serverSpeakers
      : (selectedType === 'all' ? artcousticSpeakers : (categorized[selectedType] || []));

    // Apply model filter
    if (selectedModel !== 'all') {
      base = base.filter(s => s.id === selectedModel);
    }

    // If server list is unavailable, apply client-side search to local base
    if (!Array.isArray(serverSpeakers) && (search || '').trim()) {
      const q = search.trim().toLowerCase();
      base = base.filter(s =>
        [s.model, s.brand, s.description]
          .filter(Boolean) // Filter out null/undefined values
          .some(v => String(v).toLowerCase().includes(q))
      );
    }

    return base;
  }, [serverSpeakers, selectedType, selectedModel, search, categorized]);


  const getTypeColor = (type) => {
    const colors = {
      main: "bg-blue-100 text-blue-800",
      center: "bg-green-100 text-green-800",
      surround: "bg-purple-100 text-purple-800",
      overhead: "bg-yellow-100 text-yellow-800",
      subwoofer: "bg-red-100 text-red-800"
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "subwoofer": return <Volume2 className="w-4 h-4" />;
      case "overhead": return <Layers className="w-4 h-4" />;
      default: return <Volume2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#F8F8F7]">
      {/* Artcoustic Logo */}
      <div className="w-[48px] ml-6 mt-6 mb-8">
        <div className="w-12 h-12 bg-[#1B1A1A] rounded-xl flex items-center justify-center">
          <Database className="w-6 h-6 text-white" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-4xl font-header text-[#1B1A1A] mb-2">Speaker Database</h1>
            <p className="text-[#3E4349] font-body text-lg">
              Browse Artcoustic speakers by category. Official product database.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-[#DCDBD6] text-[#3E4349] bg-white hover:bg-[#F8F8F7] font-body">
              <Download className="w-4 h-4 mr-2" />
              Export Database
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-white border-[#DCDBD6] mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="w-full md:w-1/3">
                <Label className="text-[#3E4349] mb-2 block font-body">Select Speaker Category</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#DCDBD6]">
                    <SelectItem value="all" className="text-[#1B1A1A] font-body">All Products</SelectItem>
                    {types.map(t => (
                      <SelectItem key={t.key} value={t.key} className="text-[#1B1A1A] font-body">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-1/3">
                <Label className="text-[#3E4349] mb-2 block font-body">Filter by Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                    <SelectValue placeholder="Select a Model" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#DCDBD6] max-h-[300px] overflow-y-auto">
                    <SelectItem value="all" className="text-[#1B1A1A] font-body">All Models</SelectItem>
                    {modelOptions.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-[#1B1A1A] font-body">
                        {s.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-1/3">
                <Label className="text-[#3E4349] mb-2 block font-body">Search</Label>
                <Input
                  placeholder="Search brand, model, or description…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                />
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-2 mt-4 text-[#3E4349]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-body">Loading speakers…</span>
              </div>
            )}
            {apiError && (
              <div className="mt-3 text-xs text-[#625143]">
                Server filtering unavailable ({apiError}). Falling back to local filtering.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="mb-6">
          <p className="text-[#3E4349] font-body">
            Showing {filteredSpeakers.length} speaker{filteredSpeakers.length !== 1 ? 's' : ''}
            {selectedType !== 'all' && ` in ${types.find(t => t.key === selectedType)?.label}`}
            {search.trim() && ` matching “${search.trim()}”`}
          </p>
        </div>

        {/* Speaker Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredSpeakers.map(speaker => (
            <Card key={speaker.id} className="bg-white border-[#DCDBD6] flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <Badge className={getTypeColor(speaker.type)}>
                      {getTypeIcon(speaker.type)}
                      <span className="ml-1 capitalize">{speaker.type}</span>
                    </Badge>
                    <CardTitle className="text-xl font-bold text-[#1B1A1A] mt-2 font-header">
                      {speaker.model}
                    </CardTitle>
                    <p className="text-sm text-[#3E4349] font-body">{speaker.brand}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow font-body">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#3E4349]">Sensitivity:</span>
                    <span className="text-[#1B1A1A] font-medium">{speaker.sensitivity} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3E4349]">Max Power:</span>
                    <span className="text-[#1B1A1A] font-medium">{speaker.max_power} W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3E4349]">Impedance:</span>
                    <span className="text-[#1B1A1A] font-medium">{speaker.impedance} Ω</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3E4349]">Frequency Range:</span>
                    <span className="text-[#1B1A1A] font-medium">
                      {speaker.frequency_response_low} - {speaker.frequency_response_high} Hz
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3E4349]">Dispersion:</span>
                    <span className="text-[#1B1A1A] font-medium">
                      {speaker.horizontal_dispersion_angle}° H / {speaker.vertical_dispersion_angle}° V
                    </span>
                  </div>
                  {speaker.price && (
                    <div className="flex justify-between">
                      <span className="text-[#3E4349]">Price:</span>
                      <span className="text-[#1B1A1A] font-medium">£{Number(speaker.price).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                {speaker.description && (
                  <div className="mt-3 pt-3 border-t border-[#DCDBD6]">
                    <p className="text-xs text-[#3E4349]">{speaker.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* No Results */}
        {filteredSpeakers.length === 0 && (
          <div className="text-center py-16">
            <Database className="w-12 h-12 text-[#DCDBD6] mx-auto mb-4" />
            <p className="text-[#3E4349] font-body">No speakers match the current filters.</p>
          </div>
        )}
      </div>

      {/* Book a Demo Button */}
      <div className="mt-12 mb-20 text-center">
        <a
          href="https://calendly.com/solutes-impish-0i/artcoustic-showroom"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white font-body">
            Book a Demo
          </Button>
        </a>
      </div>
    </div>
  );
}
